'use client';

import { useState, useRef, useCallback } from 'react';
import { useRoomStore } from '@/store/room-store';
import {
  FileText, FileSpreadsheet, Image as ImageIcon, File, Download, Upload, X,
  Paperclip, CheckCircle2, Clock, AlertCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { SharedFile, MAX_FILE_SIZE, FILE_CHUNK_SIZE } from '@/lib/types';
import { toast } from 'sonner';

// Max file size for data-URL embedding (1MB)
const EMBED_MAX_SIZE = 1024 * 1024;

export function FileSharingPanel() {
  const { sharedFiles, isFilesOpen, setFilesOpen, myNode, addSharedFile, updateSharedFile, engine } = useRoomStore();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Store downloaded file data blobs keyed by file ID
  const [downloadedBlobs, setDownloadedBlobs] = useState<Map<string, string>>(new Map());

  const isSpeaker = myNode?.role === 'host' || myNode?.role === 'speaker' || myNode?.role === 'co-host';

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || !engine) return;

    Array.from(files).forEach(async file => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 50MB limit`);
        return;
      }

      if (file.size > EMBED_MAX_SIZE) {
        toast.error(`${file.name} is too large. Files under 1MB are supported for P2P transfer.`);
        return;
      }

      const fileId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const sharedFile: SharedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        senderId: myNode?.peerId || '',
        senderName: myNode?.displayName || '',
        timestamp: Date.now(),
        chunks: Math.ceil(file.size / FILE_CHUNK_SIZE),
        transferredChunks: 0,
        status: 'uploading',
      };

      // Add file entry immediately so UI shows progress
      addSharedFile(sharedFile);

      try {
        // Read the file as a data URL for small files
        const dataUrl = await readFileAsDataUrl(file);

        // Create the full SharedFile with embedded data
        const fileWithData: SharedFile = {
          ...sharedFile,
          data: dataUrlToArrayBuffer(dataUrl),
          transferredChunks: sharedFile.chunks,
          status: 'available',
        };

        // Announce via engine to other participants
        engine.shareFileMetadata(fileWithData);

        // Update local store
        updateSharedFile(fileId, {
          transferredChunks: sharedFile.chunks,
          status: 'available',
        });

        toast.success(`${file.name} shared with all participants`);
      } catch (err) {
        console.error('File sharing error:', err);
        updateSharedFile(fileId, { status: 'available' });
        toast.error(`Failed to share ${file.name}`);
      }
    });
  }, [engine, myNode, addSharedFile, updateSharedFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDownload = useCallback(async (file: SharedFile) => {
    if (file.status !== 'available' && file.status !== 'downloaded') return;

    // If we already have the data embedded, offer it directly
    if (file.data) {
      updateSharedFile(file.id, { status: 'downloaded', transferredChunks: file.chunks });
      const blob = new Blob([file.data], { type: file.type });
      const url = URL.createObjectURL(blob);
      setDownloadedBlobs(prev => new Map(prev).set(file.id, url));
      triggerDownload(url, file.name);
      toast.success(`Downloaded ${file.name}`);
      return;
    }

    // Otherwise request from the network via engine
    if (!engine) return;

    updateSharedFile(file.id, { status: 'downloading', transferredChunks: 0 });

    // Request the file from the sender via P2P
    engine.requestFile(file.id);

    // The download progress is handled by the onFileChunk callback in RoomPage
    // which updates transferredChunks. We watch for status changes.
    // For now, set a timeout to check if we got the data
    const checkInterval = setInterval(() => {
      const current = useRoomStore.getState().sharedFiles.find(f => f.id === file.id);
      if (!current) {
        clearInterval(checkInterval);
        return;
      }
      if (current.data) {
        clearInterval(checkInterval);
        updateSharedFile(file.id, { status: 'downloaded', transferredChunks: current.chunks });
        const blob = new Blob([current.data], { type: current.type });
        const url = URL.createObjectURL(blob);
        setDownloadedBlobs(prev => new Map(prev).set(file.id, url));
        triggerDownload(url, current.name);
        toast.success(`Downloaded ${current.name}`);
      } else if (current.transferredChunks >= current.chunks) {
        clearInterval(checkInterval);
        updateSharedFile(file.id, { status: 'downloaded' });
        toast.success(`Downloaded ${current.name}`);
      }
    }, 500);

    // Safety timeout — stop after 30s
    setTimeout(() => clearInterval(checkInterval), 30000);
  }, [engine, updateSharedFile]);

  if (!isFilesOpen) return null;

  return (
    <div className="w-full sm:w-80 border-l border-zinc-800 bg-zinc-950 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-200">Files</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-zinc-800 text-zinc-500">
            {sharedFiles.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
          onClick={() => setFilesOpen(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Upload area (host/speaker/co-host only) */}
      {isSpeaker && (
        <div className="p-3 border-b border-zinc-800">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all
              ${isDragging
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'}`}
          >
            <Upload className={`w-5 h-5 ${isDragging ? 'text-emerald-400' : 'text-zinc-500'}`} />
            <span className="text-xs text-zinc-400 text-center">
              {isDragging ? 'Drop files here' : 'Drop files or click to upload'}
            </span>
            <span className="text-[10px] text-zinc-600">Max 1MB P2P • PDF, PPTX, Images, Docs</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
      )}

      {/* File list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {sharedFiles.length === 0 && (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-zinc-600 text-xs">No files shared yet</p>
              {isSpeaker && (
                <p className="text-zinc-700 text-xs mt-1">Upload files to share with participants</p>
              )}
            </div>
          )}
          {sharedFiles.map(file => (
            <FileItem
              key={file.id}
              file={file}
              onDownload={handleDownload}
              isOwn={file.senderId === myNode?.peerId}
              downloadedBlob={downloadedBlobs.get(file.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// Helper: read a File as a data URL string
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Helper: convert a data URL to ArrayBuffer
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper: trigger a browser download
function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function FileItem({
  file, onDownload, isOwn, downloadedBlob,
}: {
  file: SharedFile;
  onDownload: (f: SharedFile) => void;
  isOwn: boolean;
  downloadedBlob?: string;
}) {
  const progress = file.chunks > 0 ? Math.round((file.transferredChunks / file.chunks) * 100) : 0;

  const getFileIcon = () => {
    if (file.type.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-violet-400" />;
    if (file.type.includes('spreadsheet') || file.type.includes('csv') || file.type.includes('excel'))
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    if (file.type.includes('pdf') || file.type.includes('presentation') || file.type.includes('document'))
      return <FileText className="w-5 h-5 text-amber-400" />;
    return <File className="w-5 h-5 text-zinc-400" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusIcon = () => {
    switch (file.status) {
      case 'uploading':
        return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
      case 'available':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'downloading':
        return <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
      case 'downloaded':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const handleSaveFile = () => {
    if (downloadedBlob) {
      triggerDownload(downloadedBlob, file.name);
    } else if (file.data) {
      const blob = new Blob([file.data], { type: file.type });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, file.name);
    }
  };

  return (
    <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
          {getFileIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-200 truncate">{file.name}</span>
            {statusIcon()}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-zinc-500">{formatSize(file.size)}</span>
            <span className="text-[10px] text-zinc-700">•</span>
            <span className="text-[10px] text-zinc-500">{file.senderName}</span>
            {!isOwn && (
              <>
                <span className="text-[10px] text-zinc-700">•</span>
                <span className="text-[10px] text-zinc-500">
                  {new Date(file.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            )}
          </div>

          {/* Progress bar for uploading/downloading */}
          {(file.status === 'uploading' || file.status === 'downloading') && (
            <div className="mt-2">
              <Progress value={progress} className="h-1.5 bg-zinc-800" />
              <span className="text-[9px] text-zinc-600 mt-0.5">{progress}%</span>
            </div>
          )}

          {/* Download button — available for others when file is ready */}
          {file.status === 'available' && !isOwn && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 mt-1.5 px-2 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              onClick={() => onDownload(file)}
            >
              <Download className="w-3 h-3 mr-1" />
              Download
            </Button>
          )}

          {/* Already downloaded — show save again option */}
          {file.status === 'downloaded' && !isOwn && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Downloaded
              </span>
              {(downloadedBlob || file.data) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[9px] text-zinc-400 hover:text-zinc-300"
                  onClick={handleSaveFile}
                >
                  Save again
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
