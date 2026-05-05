'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRoomStore } from '@/store/room-store';
import { useTheme } from '@/components/theme-provider';
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Upload,
  FileText,
  Image as ImageIcon,
  Presentation,
  Download,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

// ============ Types ============

interface SlidePresentationProps {
  isSpeaker: boolean;
}

interface LaserDot {
  id: string;
  x: number;
  y: number;
  createdAt: number;
}

// ============ SlidePresentation Component ============

export function SlidePresentation({ isSpeaker }: SlidePresentationProps) {
  const {
    engine,
    slides,
    currentSlideIndex,
    isPresenting,
    setSlides,
    setCurrentSlideIndex,
    setIsPresenting,
  } = useRoomStore();
  const { theme } = useTheme();

  // Local UI state
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [laserDots, setLaserDots] = useState<LaserDot[]>([]);
  const [isLaserMode, setIsLaserMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slideAreaRef = useRef<HTMLDivElement>(null);

  // Derived
  const totalSlides = slides.length;
  const currentSlide = slides[currentSlideIndex] || null;

  // ---- Broadcast slide change ----
  const broadcastSlideChange = useCallback(
    (index: number) => {
      if (!engine) return;
      try {
        const myNode = engine.getMyNode();
        if (myNode) {
          const engAny = engine as unknown as Record<string, unknown>;
          if (typeof engAny.broadcastToChildren === 'function') {
            engAny.broadcastToChildren({
              type: 'slide-change',
              payload: { slideIndex: index, timestamp: Date.now() },
              senderId: myNode.peerId,
              senderName: myNode.displayName,
              roomId: '',
              timestamp: Date.now(),
            });
          }
        }
      } catch {
        // Broadcast may fail silently
      }
    },
    [engine]
  );

  // ---- Navigation ----
  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlides) return;
      setCurrentSlideIndex(index);
      if (isSpeaker) {
        broadcastSlideChange(index);
      }
    },
    [totalSlides, setCurrentSlideIndex, isSpeaker, broadcastSlideChange]
  );

  const nextSlide = useCallback(
    () => goToSlide(currentSlideIndex + 1),
    [currentSlideIndex, goToSlide]
  );
  const prevSlide = useCallback(
    () => goToSlide(currentSlideIndex - 1),
    [currentSlideIndex, goToSlide]
  );

  // ---- Keyboard navigation (speaker) ----
  useEffect(() => {
    if (!isSpeaker) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === 'Escape') {
        if (isLaserMode) {
          setIsLaserMode(false);
        } else if (isFullScreen) {
          setIsFullScreen(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSpeaker, nextSlide, prevSlide, isFullScreen, isLaserMode]);

  // ---- Listen for slide changes from engine (viewer) ----
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    if (isSpeaker || !engineRef.current) return;
    const eng = engineRef.current as unknown as Record<string, unknown>;
    const originalHandler = eng._onSlideChange;
    eng._onSlideChange = (
      data: { slideIndex: number }
    ) => {
      if (data.slideIndex >= 0 && data.slideIndex < totalSlides) {
        setCurrentSlideIndex(data.slideIndex);
      }
    };
    return () => {
      eng._onSlideChange = originalHandler;
    };
  }, [isSpeaker, totalSlides, setCurrentSlideIndex]);

  // ---- Laser pointer ----
  const handleSlideClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isLaserMode || !isSpeaker) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const dot: LaserDot = {
        id: `laser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x,
        y,
        createdAt: Date.now(),
      };
      setLaserDots((prev) => [...prev, dot]);
      setTimeout(() => {
        setLaserDots((prev) => prev.filter((d) => d.id !== dot.id));
      }, 2500);
    },
    [isLaserMode, isSpeaker]
  );

  // ---- Zoom ----
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 3)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.5)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  // ---- Fullscreen API ----
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullScreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullScreen(false);
      }
    } catch {
      setIsFullScreen(!isFullScreen);
    }
  }, [isFullScreen]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handler = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ---- Download slide ----
  const downloadSlide = useCallback(() => {
    if (!currentSlide) return;
    const link = document.createElement('a');
    link.href = currentSlide;
    link.download = `slide-${currentSlideIndex + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Slide downloaded');
  }, [currentSlide, currentSlideIndex]);

  // ---- File upload handler ----
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setIsProcessing(true);
      const newSlides: string[] = [];

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const ext = file.name.split('.').pop()?.toLowerCase();

          if (
            ext === 'png' ||
            ext === 'jpg' ||
            ext === 'jpeg' ||
            ext === 'svg' ||
            ext === 'webp'
          ) {
            const dataUrl = await readFileAsDataURL(file);
            newSlides.push(dataUrl);
          } else if (ext === 'pdf') {
            const pdfSlides = await renderPDFAsSlides(file);
            newSlides.push(...pdfSlides);
          } else if (ext === 'pptx') {
            const pptxSlides = await renderPPTXAsSlides(file);
            if (pptxSlides.length > 0) {
              newSlides.push(...pptxSlides);
            } else {
              const placeholder = createPlaceholderSlide(
                'PPTX Detected',
                'For best results, export as PDF first, then upload the PDF. Or upload individual slide images (PNG/JPG).'
              );
              newSlides.push(placeholder);
            }
          }
        }

        if (newSlides.length > 0) {
          setSlides(newSlides);
          setCurrentSlideIndex(0);
          if (!isPresenting) {
            setIsPresenting(true);
          }
          toast.success(`${newSlides.length} slide${newSlides.length !== 1 ? 's' : ''} loaded`);
        }
      } catch (err) {
        console.error('Error processing slides:', err);
        toast.error('Failed to process slides');
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [setSlides, setCurrentSlideIndex, setIsPresenting, isPresenting]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      processFiles(files);
    },
    [processFiles]
  );

  // ---- Drag & drop ----
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!isSpeaker) return;
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFiles(files);
      }
    },
    [isSpeaker, processFiles]
  );

  // ---- Present / Stop presenting ----
  const startPresenting = useCallback(() => {
    if (slides.length === 0) {
      toast.error('Upload slides first');
      return;
    }
    setIsPresenting(true);
    broadcastSlideChange(currentSlideIndex);
    toast.success('Presentation started');
  }, [slides.length, setIsPresenting, broadcastSlideChange, currentSlideIndex]);

  const stopPresenting = useCallback(() => {
    setIsPresenting(false);
    toast('Presentation ended');
  }, [setIsPresenting]);

  // ---- Go-to slide input ----
  const [goToInput, setGoToInput] = useState('');
  const handleGoToSlide = useCallback(() => {
    const num = parseInt(goToInput, 10);
    if (!isNaN(num) && num >= 1 && num <= totalSlides) {
      goToSlide(num - 1);
      setGoToInput('');
    }
  }, [goToInput, totalSlides, goToSlide]);

  // ============ No slides state (empty) ============
  if (totalSlides === 0) {
    return (
      <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Presentation className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-zinc-200">Slides</span>
          </div>
          {isSpeaker && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
          )}
        </div>

        {/* Empty / upload area */}
        <div
          className={`flex-1 flex flex-col items-center justify-center gap-4 p-6 transition-colors ${
            isDragOver && isSpeaker ? 'bg-emerald-900/20 border-2 border-dashed border-emerald-500' : ''
          }`}
          onDragOver={isSpeaker ? handleDragOver : undefined}
          onDragLeave={isSpeaker ? handleDragLeave : undefined}
          onDrop={isSpeaker ? handleDrop : undefined}
        >
          {isDragOver && isSpeaker ? (
            <>
              <Upload className="w-12 h-12 text-emerald-400 animate-bounce" />
              <p className="text-emerald-300 text-sm font-medium">Drop files here</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 text-sm text-center">No slides loaded</p>
              {isSpeaker && (
                <>
                  <p className="text-zinc-600 text-xs text-center max-w-[280px]">
                    Upload images (PNG, JPG), PDF, or PPTX files. Drag and drop or click to browse.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors border border-zinc-700"
                  >
                    <Upload className="w-4 h-4" />
                    Choose Files
                  </button>
                </>
              )}
              {!isSpeaker && (
                <p className="text-zinc-600 text-xs text-center">
                  Waiting for the presenter to share slides...
                </p>
              )}
            </>
          )}
        </div>

        {/* Hidden file input */}
        {isSpeaker && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.pptx,.png,.jpg,.jpeg,.svg,.webp"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
        )}
      </div>
    );
  }

  // ============ Slides loaded ============
  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden ${
        isFullScreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'h-full'
      }`}
    >
      {/* ---- Header toolbar ---- */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0 gap-1">
        {/* Left: Title */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Presentation className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-medium text-zinc-200 hidden sm:inline">Slides</span>
          {isSpeaker && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-400 font-medium">
              SPEAKER
            </span>
          )}
          <span className="text-[10px] sm:text-xs text-zinc-500 font-mono">
            {currentSlideIndex + 1}/{totalSlides}
          </span>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          {/* Zoom controls (viewer + speaker) */}
          <button
            onClick={zoomOut}
            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-zinc-500 min-w-[32px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          {zoom !== 1 && (
            <button
              onClick={resetZoom}
              className="p-1 rounded-md hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200 transition-colors text-[9px] font-medium px-1"
            >
              Reset
            </button>
          )}

          <div className="w-px h-4 bg-zinc-700 mx-0.5" />

          {/* Laser pointer (speaker only) */}
          {isSpeaker && (
            <button
              onClick={() => setIsLaserMode(!isLaserMode)}
              className={`p-1.5 rounded-md transition-colors ${
                isLaserMode
                  ? 'bg-red-600/20 text-red-400'
                  : 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
              title={isLaserMode ? 'Disable Laser' : 'Laser Pointer'}
            >
              <div className={`w-3 h-3 rounded-full ${isLaserMode ? 'bg-red-500 animate-pulse' : 'bg-red-400/60'}`} />
            </button>
          )}

          {/* Present / Stop (speaker only) */}
          {isSpeaker && (
            <button
              onClick={isPresenting ? stopPresenting : startPresenting}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                isPresenting
                  ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              <Presentation className="w-3 h-3" />
              <span className="hidden sm:inline">{isPresenting ? 'Stop' : 'Present'}</span>
            </button>
          )}

          {/* Upload (speaker only) */}
          {isSpeaker && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
              title="Upload Slides"
            >
              {isProcessing ? (
                <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Download (viewer) */}
          {!isSpeaker && (
            <button
              onClick={downloadSlide}
              className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Download Slide"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullScreen ? (
              <Minimize className="w-3.5 h-3.5" />
            ) : (
              <Maximize className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Close (when fullscreen) */}
          {isFullScreen && (
            <button
              onClick={() => setIsFullScreen(false)}
              className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ---- Main slide area ---- */}
      <div
        className="flex-1 relative overflow-hidden bg-black flex items-center justify-center min-h-0"
        onDragOver={isSpeaker ? handleDragOver : undefined}
        onDragLeave={isSpeaker ? handleDragLeave : undefined}
        onDrop={isSpeaker ? handleDrop : undefined}
      >
        {/* Drag overlay */}
        {isDragOver && isSpeaker && (
          <div className="absolute inset-0 z-30 bg-emerald-900/30 border-2 border-dashed border-emerald-500 flex items-center justify-center">
            <div className="text-center">
              <Upload className="w-10 h-10 text-emerald-400 mx-auto mb-2 animate-bounce" />
              <p className="text-emerald-300 text-sm font-medium">Drop files to add slides</p>
            </div>
          </div>
        )}

        {/* Slide image */}
        {currentSlide && (
          <div
            ref={slideAreaRef}
            className="relative max-w-full max-h-full"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease-out',
            }}
            onClick={handleSlideClick}
          >
            <img
              src={currentSlide}
              alt={`Slide ${currentSlideIndex + 1}`}
              className={`max-w-full max-h-[calc(100vh-180px)] object-contain select-none ${
                isLaserMode && isSpeaker ? 'cursor-crosshair' : ''
              }`}
              draggable={false}
            />

            {/* Laser dots */}
            {laserDots.map((dot) => (
              <div
                key={dot.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${dot.x}%`,
                  top: `${dot.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="w-4 h-4 rounded-full bg-red-500 animate-ping opacity-75" />
                <div className="absolute inset-0 w-4 h-4 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
              </div>
            ))}

            {/* Laser mode indicator */}
            {isLaserMode && isSpeaker && (
              <div className="absolute top-2 right-2 px-2 py-1 rounded bg-red-600/80 text-white text-[10px] font-medium">
                Laser Pointer
              </div>
            )}
          </div>
        )}

        {/* Navigation arrows overlay (speaker only) */}
        {isSpeaker && totalSlides > 1 && !isLaserMode && (
          <>
            {currentSlideIndex > 0 && (
              <button
                onClick={prevSlide}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all backdrop-blur-sm"
                style={{ opacity: 0.7 }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {currentSlideIndex < totalSlides - 1 && (
              <button
                onClick={nextSlide}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all backdrop-blur-sm"
                style={{ opacity: 0.7 }}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </>
        )}

        {/* Slide number badge */}
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 text-zinc-300 text-xs font-mono">
          {currentSlideIndex + 1}/{totalSlides}
        </div>

        {/* Viewer indicator */}
        {!isSpeaker && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 text-emerald-400 text-[10px] font-medium flex items-center gap-1">
            <FileText className="w-2.5 h-2.5" />
            Live Slide
          </div>
        )}
      </div>

      {/* ---- Bottom navigation bar ---- */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-zinc-900 border-t border-zinc-800 flex-shrink-0 gap-1">
        {/* Left: Navigation */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={prevSlide}
            disabled={currentSlideIndex <= 0}
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs text-zinc-400 font-mono min-w-[50px] text-center">
            {currentSlideIndex + 1} / {totalSlides}
          </span>

          <button
            onClick={nextSlide}
            disabled={currentSlideIndex >= totalSlides - 1}
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Go-to slide (speaker only) */}
        {isSpeaker && totalSlides > 3 && (
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-[10px] text-zinc-500">Go to:</span>
            <input
              type="number"
              min={1}
              max={totalSlides}
              value={goToInput}
              onChange={(e) => setGoToInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGoToSlide()}
              className="w-12 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-mono text-center focus:outline-none focus:border-emerald-500"
              placeholder="#"
            />
            <button
              onClick={handleGoToSlide}
              className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] transition-colors"
            >
              Go
            </button>
          </div>
        )}

        {/* Right: Action buttons */}
        <div className="flex items-center gap-1">
          {/* Upload (speaker) */}
          {isSpeaker && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors disabled:opacity-50"
            >
              {isProcessing ? (
                <div className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">
                {isProcessing ? 'Processing...' : 'Upload'}
              </span>
            </button>
          )}

          {/* Download (viewer) */}
          {!isSpeaker && (
            <button
              onClick={downloadSlide}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}

          {/* Slide count badge */}
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">
            {totalSlides} slide{totalSlides !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ---- Thumbnail strip (speaker only) ---- */}
      {isSpeaker && totalSlides > 1 && (
        <div className="bg-zinc-900/50 border-t border-zinc-800 px-2 py-1.5 flex-shrink-0">
          <div className="flex gap-1.5 overflow-x-auto max-h-20 pb-1">
            {slides.map((slide, index) => (
              <button
                key={`thumb-${index}`}
                onClick={() => goToSlide(index)}
                className={`flex-shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                  index === currentSlideIndex
                    ? 'border-emerald-500 ring-1 ring-emerald-500/50 scale-105'
                    : 'border-zinc-700 hover:border-zinc-500 opacity-70 hover:opacity-100'
                }`}
              >
                <img
                  src={slide}
                  alt={`Slide ${index + 1}`}
                  className="h-12 sm:h-14 w-auto object-contain bg-zinc-800"
                  loading="lazy"
                />
                <div
                  className={`text-center text-[8px] py-0.5 font-mono ${
                    index === currentSlideIndex
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-zinc-500'
                  }`}
                >
                  {index + 1}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hidden file input (speaker only) */}
      {isSpeaker && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.png,.jpg,.jpeg,.svg,.webp"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      )}
    </div>
  );
}

// ============ Utility Functions ============

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderPDFAsSlides(file: File): Promise<string[]> {
  const dataUrl = await readFileAsDataURL(file);
  const result: string[] = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pageCount = estimatePDFPageCount(arrayBuffer);

    // Attempt dynamic PDF.js load
    try {
      const pdfjsLib = await loadPDFJs();
      if (pdfjsLib) {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          result.push(canvas.toDataURL('image/jpeg', 0.92));
        }
        return result;
      }
    } catch {
      // PDF.js not available, fall through
    }

    // Fallback: create embed slide
    const embedSlide = createPDFEmbedSlide(dataUrl, file.name);
    result.push(embedSlide);

    if (pageCount > 1) {
      for (let i = 1; i <= pageCount; i++) {
        result.push(
          createPlaceholderSlide(
            `Page ${i} of ${pageCount}`,
            'Upload individual slide images for best navigation experience.'
          )
        );
      }
    }
  } catch {
    const embedSlide = createPDFEmbedSlide(dataUrl, file.name);
    result.push(embedSlide);
  }

  return result;
}

interface PDFJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PDFDocument> };
}

interface PDFDocument {
  numPages: number;
  getPage: (num: number) => Promise<PDFPage>;
}

interface PDFPage {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
}

async function loadPDFJs(): Promise<PDFJsLib | null> {
  try {
    // Try loading pdfjs from CDN via a script tag
    if ((window as unknown as Record<string, unknown>).pdfjsLib) {
      return (window as unknown as Record<string, unknown>).pdfjsLib as PDFJsLib;
    }

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        const lib = (window as unknown as Record<string, unknown>).pdfjsLib as PDFJsLib | undefined;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(lib);
        } else {
          resolve(null);
        }
      };
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  } catch {
    return null;
  }
}

async function renderPPTXAsSlides(file: File): Promise<string[]> {
  const result: string[] = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    if (uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
      return result;
    }

    const slideTexts = extractPPTXSlideTexts(arrayBuffer);

    if (slideTexts.length === 0) {
      return result;
    }

    for (let i = 0; i < slideTexts.length; i++) {
      const slideImage = renderTextToSlideCanvas(
        slideTexts[i] || `Slide ${i + 1}`,
        `Slide ${i + 1}`,
        i + 1,
        slideTexts.length
      );
      result.push(slideImage);
    }
  } catch {
    // PPTX parsing failed
  }

  return result;
}

function extractPPTXSlideTexts(arrayBuffer: ArrayBuffer): string[] {
  const slidesMap: Map<number, string> = new Map();
  const data = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(data);

  const textMatches: string[] = [];
  const regex = /<a:t>([^<]*)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1].trim()) {
      textMatches.push(match[1].trim());
    }
  }

  const slideBoundaryRegex = /ppt\/slides\/slide(\d+)\.xml/g;
  const slidePositions: { index: number; slideNum: number }[] = [];
  while ((match = slideBoundaryRegex.exec(text)) !== null) {
    slidePositions.push({
      index: match.index,
      slideNum: parseInt(match[1], 10),
    });
  }

  if (slidePositions.length > 0) {
    for (const pos of slidePositions) {
      const nextPos = slidePositions.find(
        (s) => s.slideNum === pos.slideNum + 1
      );
      const startPos = pos.index;
      const endPos = nextPos ? nextPos.index : Math.min(startPos + 5000, text.length);
      const slideContent = text.substring(startPos, endPos);
      const slideTexts: string[] = [];
      const innerRegex = /<a:t>([^<]*)<\/a:t>/g;
      let innerMatch: RegExpExecArray | null;
      while ((innerMatch = innerRegex.exec(slideContent)) !== null) {
        if (innerMatch[1].trim()) {
          slideTexts.push(innerMatch[1].trim());
        }
      }
      slidesMap.set(pos.slideNum, slideTexts.join('\n'));
    }

    const maxSlide = Math.max(...Array.from(slidesMap.keys()));
    const result: string[] = [];
    for (let i = 1; i <= maxSlide; i++) {
      result.push(slidesMap.get(i) || '');
    }
    return result;
  }

  if (textMatches.length > 0) {
    return [textMatches.join('\n')];
  }

  return [];
}

function renderTextToSlideCanvas(
  textContent: string,
  title: string,
  slideNum: number,
  totalSlides: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createLinearGradient(0, 0, 0, 720);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1280, 720);

  ctx.fillStyle = '#10b981';
  ctx.fillRect(60, 60, 4, 80);

  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(title, 80, 100);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';

  const lines = textContent.split('\n');
  const maxLines = 12;
  const lineHeight = 36;
  const startY = 180;

  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const line = lines[i];
    const maxChars = 60;
    const displayLine =
      line.length > maxChars ? line.substring(0, maxChars) + '...' : line;
    ctx.fillText(displayLine, 80, startY + i * lineHeight);
  }

  if (lines.length > maxLines) {
    ctx.fillStyle = '#71717a';
    ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(
      `... and ${lines.length - maxLines} more lines`,
      80,
      startY + maxLines * lineHeight
    );
  }

  ctx.fillStyle = '#52525b';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${slideNum} / ${totalSlides}`, 1160, 690);

  ctx.fillStyle = '#52525b';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Converted from PPTX', 80, 690);

  return canvas.toDataURL('image/jpeg', 0.9);
}

function createPlaceholderSlide(title: string, subtitle: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createLinearGradient(0, 0, 0, 720);
  gradient.addColorStop(0, '#18181b');
  gradient.addColorStop(1, '#27272a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1280, 720);

  ctx.fillStyle = '#3f3f46';
  ctx.font = '64px serif';
  ctx.textAlign = 'center';
  ctx.fillText('\uD83D\uDCC4', 640, 300);

  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(title, 640, 380);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';

  const words = subtitle.split(' ');
  let line = '';
  let y = 430;
  const maxWidth = 900;

  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line.trim(), 640, y);
      line = word + ' ';
      y += 28;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), 640, y);
  }

  ctx.textAlign = 'left';
  return canvas.toDataURL('image/jpeg', 0.85);
}

function createPDFEmbedSlide(pdfDataUrl: string, fileName: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 1280, 720);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(560, 200, 160, 200);
  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PDF', 640, 330);

  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(fileName, 640, 460);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('PDF loaded \u2014 viewer will display it', 640, 500);

  ctx.textAlign = 'left';

  return canvas.toDataURL('image/jpeg', 0.85);
}

function estimatePDFPageCount(arrayBuffer: ArrayBuffer): number {
  const data = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(data);

  let count = 0;
  const regex = /\/Type\s*\/Page[^s]/g;
  while (regex.exec(text) !== null) {
    count++;
  }

  const countMatch = text.match(/\/Pages[\s\S]*?\/Count\s+(\d+)/);
  if (countMatch) {
    return parseInt(countMatch[1], 10);
  }

  return count || 1;
}
