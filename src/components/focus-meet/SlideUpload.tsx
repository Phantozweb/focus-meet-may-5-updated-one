'use client';

import { useState, useCallback, useRef } from 'react';
import { useRoomStore } from '@/store/room-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Presentation, ChevronLeft, ChevronRight,
  Trash2, Play, X, Sliders, FileUp, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export function SlideUpload() {
  const { slides, setSlides, currentSlideIndex, setCurrentSlideIndex, isPresenting, setIsPresenting, engine } = useRoomStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newSlides: string[] = [];

    for (const file of fileArray) {
      if (file.type.startsWith('image/')) {
        // Direct image upload — convert to data URL
        try {
          const dataUrl = await readFileAsDataUrl(file);
          newSlides.push(dataUrl);
        } catch {
          toast.error(`Failed to load ${file.name}`);
        }
      } else if (file.name.endsWith('.pptx')) {
        // PPTX files — parse and extract slide images
        setIsProcessing(true);
        setProcessingStatus(`Extracting slides from ${file.name}...`);
        try {
          const slideImages = await extractPptxSlides(file);
          if (slideImages.length > 0) {
            newSlides.push(...slideImages);
            toast.success(`Extracted ${slideImages.length} slide${slideImages.length > 1 ? 's' : ''} from ${file.name}`);
          } else {
            toast.warning(`No slide images found in ${file.name}`, {
              description: 'The PPTX may contain only text/layout data. Try exporting slides as images.',
              duration: 5000,
            });
          }
        } catch (err) {
          console.error('PPTX extraction error:', err);
          toast.error(`Failed to parse ${file.name}`, {
            description: 'Try exporting your slides as images (PNG/JPG) and uploading them directly.',
            duration: 5000,
          });
        }
        setIsProcessing(false);
        setProcessingStatus('');
      } else if (file.name.endsWith('.ppt')) {
        toast.info(`Legacy .ppt format not supported: ${file.name}`, {
          description: 'Please save as .pptx or export slides as images.',
          duration: 5000,
        });
      } else if (file.type === 'application/pdf') {
        toast.info(`PDF detected: ${file.name}`, {
          description: 'For best results, export PDF pages as images.',
          duration: 5000,
        });
        newSlides.push(createPlaceholderSlide(file.name, 'PDF'));
      }
    }

    if (newSlides.length > 0) {
      setSlides([...slides, ...newSlides]);
      if (newSlides.length > 1) {
        toast.success(`Added ${newSlides.length} slides`);
      }
    }
  }, [slides, setSlides]);

  const handleRemoveSlide = useCallback((index: number) => {
    const newSlides = [...slides];
    newSlides.splice(index, 1);
    setSlides(newSlides);
    if (currentSlideIndex >= newSlides.length) {
      setCurrentSlideIndex(Math.max(0, newSlides.length - 1));
    }
  }, [slides, setSlides, currentSlideIndex, setCurrentSlideIndex]);

  const handleClearAll = useCallback(() => {
    setSlides([]);
    setCurrentSlideIndex(0);
    setIsPresenting(false);
  }, [setSlides, setCurrentSlideIndex, setIsPresenting]);

  const handleTogglePresentation = useCallback(() => {
    if (slides.length === 0) {
      toast.error('Upload slides first');
      return;
    }
    const newPresenting = !isPresenting;
    setIsPresenting(newPresenting);
    if (newPresenting && engine) {
      engine.broadcastSlideChange(0);
    }
    toast.success(newPresenting ? 'Presentation started' : 'Presentation stopped');
  }, [isPresenting, slides, setIsPresenting, engine]);

  const handleSlideNav = useCallback((index: number) => {
    if (index < 0 || index >= slides.length) return;
    setCurrentSlideIndex(index);
    if (engine && isPresenting) {
      engine.broadcastSlideChange(index);
    }
  }, [slides, setCurrentSlideIndex, engine, isPresenting]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Presentation className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-zinc-200">Slides</span>
            {slides.length > 0 && (
              <Badge className="h-5 px-1.5 text-[9px] bg-emerald-500/20 text-emerald-400 border-0">
                {slides.length}
              </Badge>
            )}
          </div>
          {slides.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[9px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={handleClearAll}
            >
              <Trash2 className="w-3 h-3 mr-1" />Clear
            </Button>
          )}
        </div>
      </div>

      {/* Upload area */}
      <div
        className={`px-4 py-4 border-b border-zinc-800 flex-shrink-0 transition-colors ${
          isDragging ? 'bg-emerald-500/5' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pptx,.ppt,.pdf"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ''; }}
          disabled={isProcessing}
        />
        {isProcessing ? (
          <div className="w-full py-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            <p className="text-xs text-emerald-400">{processingStatus}</p>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`w-full py-4 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center gap-2 ${
              isDragging
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/50'
            }`}
          >
            <FileUp className={`w-6 h-6 ${isDragging ? 'text-emerald-400' : 'text-zinc-600'}`} />
            <p className="text-xs text-zinc-500">
              {isDragging ? 'Drop files here' : 'Upload slides'}
            </p>
            <p className="text-[10px] text-zinc-700">PNG, JPG, PPTX</p>
          </button>
        )}
      </div>

      {/* Presentation controls */}
      {slides.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleTogglePresentation}
              className={`flex-1 h-8 text-xs font-semibold ${
                isPresenting
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isPresenting ? (
                <><X className="w-3.5 h-3.5 mr-1" />Stop Presenting</>
              ) : (
                <><Play className="w-3.5 h-3.5 mr-1" />Present Slides</>
              )}
            </Button>
            {isPresenting && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-zinc-700 text-zinc-400"
                  onClick={() => handleSlideNav(currentSlideIndex - 1)}
                  disabled={currentSlideIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-zinc-400 min-w-[40px] text-center">
                  {currentSlideIndex + 1}/{slides.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-zinc-700 text-zinc-400"
                  onClick={() => handleSlideNav(currentSlideIndex + 1)}
                  disabled={currentSlideIndex >= slides.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Slide thumbnails */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {slides.length === 0 ? (
            <div className="text-center py-8">
              <Sliders className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-600">No slides uploaded</p>
              <p className="text-[10px] text-zinc-700 mt-1">Upload images or PPTX files to present</p>
            </div>
          ) : (
            slides.map((slide, i) => (
              <div
                key={i}
                className={`relative group rounded-lg overflow-hidden border transition-all ${
                  i === currentSlideIndex && isPresenting
                    ? 'border-emerald-500 ring-1 ring-emerald-500/50'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <button
                  onClick={() => handleSlideNav(i)}
                  className="w-full text-left"
                >
                  {slide.startsWith('data:image') ? (
                    <img
                      src={slide}
                      alt={`Slide ${i + 1}`}
                      className="w-full h-24 object-cover"
                    />
                  ) : (
                    <div className="w-full h-24 bg-zinc-800 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-zinc-600" />
                    </div>
                  )}
                </button>
                <div className="absolute top-1 left-1">
                  <Badge className="h-4 px-1 text-[8px] bg-black/60 text-zinc-300 border-0">
                    {i + 1}
                  </Badge>
                </div>
                <button
                  onClick={() => handleRemoveSlide(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PPTX Extraction — parses .pptx ZIP to extract slide images
// ─────────────────────────────────────────────────────────────

async function extractPptxSlides(file: File): Promise<string[]> {
  // Dynamic import of JSZip (client-side only)
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  const slides: string[] = [];

  // Strategy 1: Extract embedded images from slide media
  // PPTX stores images in ppt/media/ folder
  const mediaFiles: string[] = [];
  zip.forEach((relativePath, zipEntry) => {
    if (relativePath.startsWith('ppt/media/') && !zipEntry.dir) {
      mediaFiles.push(relativePath);
    }
  });

  // Sort media files to maintain order
  mediaFiles.sort();

  // Extract images from media folder
  for (const mediaPath of mediaFiles) {
    const entry = zip.file(mediaPath);
    if (!entry) continue;

    const ext = mediaPath.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext || '')) {
      try {
        const blob = await entry.async('blob');
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'svg' ? 'image/svg+xml'
          : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
          : ext === 'bmp' ? 'image/bmp'
          : 'image/png';
        const typedBlob = new Blob([blob], { type: mimeType });
        const dataUrl = await blobToDataUrl(typedBlob);
        slides.push(dataUrl);
      } catch (err) {
        console.warn(`Failed to extract ${mediaPath}:`, err);
      }
    }
  }

  // If we got images from media, return them
  if (slides.length > 0) return slides;

  // Strategy 2: If no media images found, render slide XML to canvas
  // This is a simplified approach — parse slide XML and render basic content
  const slideFiles: string[] = [];
  zip.forEach((relativePath, zipEntry) => {
    // Match ppt/slides/slide1.xml, ppt/slides/slide2.xml, etc.
    const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match && !zipEntry.dir) {
      slideFiles.push(relativePath);
    }
  });

  // Sort by slide number
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
    return numA - numB;
  });

  if (slideFiles.length > 0) {
    // Extract text from each slide and render as a canvas image
    for (const slidePath of slideFiles) {
      const entry = zip.file(slidePath);
      if (!entry) continue;

      try {
        const xmlContent = await entry.async('text');
        const textContent = extractTextFromSlideXml(xmlContent);
        const slideImage = renderSlideTextToCanvas(textContent, slidePath);
        slides.push(slideImage);
      } catch (err) {
        console.warn(`Failed to render ${slidePath}:`, err);
      }
    }
  }

  return slides;
}

/** Extract text content from slide XML */
function extractTextFromSlideXml(xml: string): string[] {
  const texts: string[] = [];
  // Simple regex extraction of <a:t> text elements
  const textRegex = /<a:t[^>]*>([^<]+)<\/a:t>/g;
  let match;
  while ((match = textRegex.exec(xml)) !== null) {
    const text = match[1].trim();
    if (text) texts.push(text);
  }
  return texts;
}

/** Render extracted text to a canvas slide image */
function renderSlideTextToCanvas(texts: string[], slidePath: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  // Background — dark theme
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 1280, 720);

  // Title bar
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, 1280, 100);

  // Slide number badge
  const slideNum = slidePath.match(/slide(\d+)/)?.[1] || '?';
  ctx.fillStyle = '#52525b';
  ctx.font = '14px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(`Slide ${slideNum}`, 1260, 30);

  // Title (first text element, if any)
  ctx.textAlign = 'left';
  if (texts.length > 0) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 32px system-ui, sans-serif';
    wrapText(ctx, texts[0], 60, 65, 1160, 40);
  }

  // Body content (remaining text elements)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px system-ui, sans-serif';
  let y = 150;
  for (let i = 1; i < texts.length && y < 660; i++) {
    y = wrapText(ctx, texts[i], 60, y, 1160, 26);
    y += 8;
  }

  // Subtle border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, 1280, 720);

  return canvas.toDataURL('image/png');
}

/** Word-wrap text on canvas, returns the Y position after the last line */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line + (line ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

/** Convert a Blob to a data URL */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper: Read file as data URL
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper: Create a placeholder slide for unsupported file types
function createPlaceholderSlide(fileName: string, fileType: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 1280, 720);

  // Border
  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, 1200, 640);

  // File type label
  ctx.fillStyle = '#71717a';
  ctx.font = 'bold 48px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(fileType === 'PDF' ? '📄' : '📋', 640, 320);

  // Filename
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '20px system-ui';
  ctx.fillText(fileName, 640, 400);

  // Hint
  ctx.fillStyle = '#52525b';
  ctx.font = '14px system-ui';
  ctx.fillText('Export as images for best experience', 640, 450);

  return canvas.toDataURL('image/png');
}
