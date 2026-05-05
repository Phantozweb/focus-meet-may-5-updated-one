'use client';

import { useState, useRef } from 'react';
import { useRoomStore } from '@/store/room-store';
import {
  FileText, FileSpreadsheet, Image as ImageIcon, File, Download, Upload, X,
  Paperclip, CheckCircle2, Clock, AlertCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { SharedFile, MAX_FILE_SIZE } from '@/lib/types';
import { toast } from 'sonner';

export function FileSharingPanel() {
  const { sharedFiles, isFilesOpen, setFilesOpen, myNode, addSharedFile, updateSharedFile } = useRoomStore();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSpeaker = myNode?.role === 'host' || myNode?.role === 'speaker';

  const simulateUpload = (fileId: string, file: File) => {
    const totalChunks = Math.ceil(file.size / (16 * 1024));
    let transferred = 0;
    const interval = setInterval(() => {
      transferred += Math.ceil(totalChunks / 10);
      if (transferred >= totalChunks) {
        transferred = totalChunks;
        clearInterval(interval);
        updateSharedFile(fileId, { transferredChunks: transferred, status: 'available' });
      } else {
        updateSharedFile(fileId, { transferredChunks: transferred });
      }
    }, 300);
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    Array.from(files).forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 50MB limit`);
        return;
      }

      const sharedFile: SharedFile = {
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        senderId: myNode?.peerId || '',
        senderName: myNode?.displayName || '',
        timestamp: Date.now(),
        chunks: Math.ceil(file.size / (16 * 1024)),
        transferredChunks: 0,
        status: 'uploading',
      };

      addSharedFile(sharedFile);
      simulateUpload(sharedFile.id, file);
    });
  };

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

  const handleDownload = (file: SharedFile) => {
    if (file.status !== 'available' && file.status !== 'downloaded') return;

    updateSharedFile(file.id, { status: 'downloading', transferredChunks: 0 });

    // Simulate download
    let transferred = 0;
    const interval = setInterval(() => {
      transferred += Math.ceil(file.chunks / 8);
      if (transferred >= file.chunks) {
        transferred = file.chunks;
        clearInterval(interval);
        updateSharedFile(file.id, { transferredChunks: transferred, status: 'downloaded' });
        toast.success(`Downloaded ${file.name}`);
      } else {
        updateSharedFile(file.id, { transferredChunks: transferred });
      }
    }, 200);
  };

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

      {/* Upload area (host/speaker only) */}
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
            <span className="text-[10px] text-zinc-600">Max 50MB • PDF, PPTX, Images, Docs</span>
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
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function FileItem({
  file, onDownload, isOwn,
}: {
  file: SharedFile;
  onDownload: (f: SharedFile) => void;
  isOwn: boolean;
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

          {/* Download button */}
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
          {file.status === 'downloaded' && !isOwn && (
            <span className="text-[10px] text-emerald-400 mt-1.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Downloaded
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
