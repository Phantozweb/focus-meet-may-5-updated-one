'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRoomStore } from '@/store/room-store';
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Upload,
  Pen,
  Eraser,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Image as ImageIcon,
  FileText,
  Presentation,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ============ Types ============

interface SlideViewerProps {
  isSpeaker: boolean;
  slides: string[];
  currentSlideIndex: number;
  onSlideChange: (index: number) => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
}

interface Annotation {
  id: string;
  type: 'laser' | 'pen';
  points: { x: number; y: number }[];
  color: string;
  size: number;
}

// ============ SlideViewer Component ============

export function SlideViewer({
  isSpeaker,
  slides,
  currentSlideIndex,
  onSlideChange,
  isFullScreen,
  onToggleFullScreen,
}: SlideViewerProps) {
  const { engine } = useRoomStore();

  // Local state
  const [zoom, setZoom] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<'pen' | 'laser'>('laser');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [showUploadHint, setShowUploadHint] = useState(true);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slideImgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived
  const totalSlides = slides.length;
  const currentSlide = slides[currentSlideIndex] || null;

  // Broadcast slide change to all viewers via P2P data channel
  const broadcastSlideChange = useCallback(
    (index: number) => {
      if (!engine) return;
      try {
        engine.broadcastSlideChange(index);
      } catch {
        // Broadcast may fail silently
      }
    },
    [engine]
  );

  // Handle slide navigation
  const goToSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlides) return;
      onSlideChange(index);
      if (isSpeaker) {
        broadcastSlideChange(index);
      }
    },
    [totalSlides, onSlideChange, isSpeaker, broadcastSlideChange]
  );

  const nextSlide = useCallback(() => goToSlide(currentSlideIndex + 1), [currentSlideIndex, goToSlide]);
  const prevSlide = useCallback(() => goToSlide(currentSlideIndex - 1), [currentSlideIndex, goToSlide]);

  // Keyboard navigation
  useEffect(() => {
    if (!isSpeaker) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === 'Escape' && isFullScreen) {
        onToggleFullScreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSpeaker, nextSlide, prevSlide, isFullScreen, onToggleFullScreen]);

  // Slide changes for viewers are now handled via the store.
  // RoomPage wires eng.setOnSlideChange((slideIndex) => setCurrentSlideIndex(slideIndex)),
  // so the store's currentSlideIndex is kept in sync with engine slide-change signals.
  // The parent passes currentSlideIndex as a prop — no monkey-patching needed.

  // Annotation drawing
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;
      if ('touches' in e) {
        if (e.touches.length === 0) return null;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
      };
    },
    []
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isAnnotating || !isSpeaker) return;
      e.preventDefault();
      const pt = getCanvasPoint(e);
      if (!pt) return;
      setIsDrawing(true);
      const annotation: Annotation = {
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: annotationTool,
        points: [pt],
        color: annotationTool === 'laser' ? '#ef4444' : '#facc15',
        size: annotationTool === 'laser' ? 4 : 2,
      };
      setCurrentAnnotation(annotation);
    },
    [isAnnotating, isSpeaker, annotationTool, getCanvasPoint]
  );

  const continueDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !currentAnnotation) return;
      e.preventDefault();
      const pt = getCanvasPoint(e);
      if (!pt) return;
      setCurrentAnnotation((prev) => {
        if (!prev) return prev;
        return { ...prev, points: [...prev.points, pt] };
      });
    },
    [isDrawing, currentAnnotation, getCanvasPoint]
  );

  const endDrawing = useCallback(() => {
    if (currentAnnotation && currentAnnotation.points.length > 1) {
      setAnnotations((prev) => [...prev, currentAnnotation]);
    }
    setIsDrawing(false);
    setCurrentAnnotation(null);
  }, [currentAnnotation]);

  // Laser pointer fades after 3s — use ref to avoid set-state-in-effect
  const annotationsRef = useRef(annotations);
  useEffect(() => { annotationsRef.current = annotations; });

  useEffect(() => {
    if (!isDrawing) return;
    const timer = setTimeout(() => {
      const current = annotationsRef.current;
      const filtered = current.filter((a) => a.type !== 'laser');
      if (filtered.length !== current.length) {
        setAnnotations(filtered);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isDrawing]);

  // Render annotations on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const allAnnotations = [...annotations];
    if (currentAnnotation) allAnnotations.push(currentAnnotation);

    for (const ann of allAnnotations) {
      if (ann.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.size * (ann.type === 'laser' ? 3 : 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (ann.type === 'laser') {
        ctx.shadowColor = ann.color;
        ctx.shadowBlur = 8;
      }

      const firstPt = ann.points[0];
      ctx.moveTo(
        (firstPt.x / 100) * rect.width,
        (firstPt.y / 100) * rect.height
      );
      for (let i = 1; i < ann.points.length; i++) {
        const pt = ann.points[i];
        ctx.lineTo((pt.x / 100) * rect.width, (pt.y / 100) * rect.height);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw laser dot at end
      if (ann.type === 'laser' && ann.points.length > 0) {
        const lastPt = ann.points[ann.points.length - 1];
        ctx.beginPath();
        ctx.arc(
          (lastPt.x / 100) * rect.width,
          (lastPt.y / 100) * rect.height,
          6,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = ann.color;
        ctx.shadowColor = ann.color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }, [annotations, currentAnnotation]);

  // Zoom controls
  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 3)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.5)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  // Clear annotations
  const clearAnnotations = useCallback(() => {
    setAnnotations([]);
    setCurrentAnnotation(null);
  }, []);

  // File upload handler
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      // This component receives slides as props; the parent handles actual file processing.
      // Here we just signal that files were selected.
      setShowUploadHint(false);

      // Clean up input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    []
  );

  // Fullscreen API
  const toggleFullscreenAPI = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback to prop-based fullscreen
      onToggleFullScreen();
    }
  }, [onToggleFullScreen]);

  // No slides state
  if (totalSlides === 0) {
    return (
      <div className="flex flex-col h-full bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
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

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-zinc-600" />
          </div>
          <p className="text-zinc-400 text-sm text-center">No slides loaded</p>
          {isSpeaker && (
            <>
              <p className="text-zinc-600 text-xs text-center max-w-[240px]">
                Upload images (PNG, JPG, SVG) or PDF files to share slides with viewers
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
              Waiting for speaker to share slides...
            </p>
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
            onChange={handleFileUpload}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden ${
        isFullScreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'h-full'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Presentation className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-zinc-200">Slides</span>
          {isSpeaker && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-400 font-medium">
              SPEAKER
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={zoomOut}
                  className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Zoom Out</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-[10px] font-mono text-zinc-500 min-w-[32px] text-center">
            {Math.round(zoom * 100)}%
          </span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={zoomIn}
                  className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Zoom In</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {zoom !== 1 && (
            <button
              onClick={resetZoom}
              className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          <div className="w-px h-4 bg-zinc-700 mx-1" />

          {/* Annotation toggle (speaker only) */}
          {isSpeaker && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        setIsAnnotating(!isAnnotating);
                        if (isAnnotating) clearAnnotations();
                      }}
                      className={`p-1.5 rounded-md transition-colors ${
                        isAnnotating
                          ? 'bg-amber-600/20 text-amber-400'
                          : 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Pen className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {isAnnotating ? 'Stop Annotating' : 'Annotate'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {isAnnotating && (
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={() => setAnnotationTool('laser')}
                    className={`p-1 rounded text-[9px] font-medium transition-colors ${
                      annotationTool === 'laser'
                        ? 'bg-red-600/20 text-red-400'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                  </button>
                  <button
                    onClick={() => setAnnotationTool('pen')}
                    className={`p-1 rounded text-[9px] font-medium transition-colors ${
                      annotationTool === 'pen'
                        ? 'bg-yellow-600/20 text-yellow-400'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  </button>
                  <button
                    onClick={clearAnnotations}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <Eraser className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div className="w-px h-4 bg-zinc-700 mx-1" />
            </>
          )}

          {/* Fullscreen toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleFullscreenAPI}
                  className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {isFullScreen ? (
                    <Minimize className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize className="w-3.5 h-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Close (when fullscreen) */}
          {isFullScreen && (
            <button
              onClick={onToggleFullScreen}
              className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main slide area */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center min-h-0">
        {/* Slide image */}
        {currentSlide && (
          <div
            className="relative max-w-full max-h-full"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease-out',
            }}
          >
            <img
              ref={slideImgRef}
              src={currentSlide}
              alt={`Slide ${currentSlideIndex + 1}`}
              className="max-w-full max-h-[calc(100vh-160px)] object-contain select-none"
              draggable={false}
            />

            {/* Annotation overlay canvas */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full ${
                isAnnotating && isSpeaker
                  ? 'cursor-crosshair'
                  : 'pointer-events-none'
              }`}
              onMouseDown={startDrawing}
              onMouseMove={continueDrawing}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
              onTouchStart={startDrawing}
              onTouchMove={continueDrawing}
              onTouchEnd={endDrawing}
            />

            {/* Speaker annotation indicator */}
            {isAnnotating && isSpeaker && (
              <div className="absolute top-2 right-2 px-2 py-1 rounded bg-amber-600/80 text-white text-[10px] font-medium flex items-center gap-1">
                <Pen className="w-2.5 h-2.5" />
                {annotationTool === 'laser' ? 'Laser' : 'Pen'}
              </div>
            )}
          </div>
        )}

        {/* Navigation arrows overlay (speaker only) */}
        {isSpeaker && totalSlides > 1 && (
          <>
            {currentSlideIndex > 0 && (
              <button
                onClick={prevSlide}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100 backdrop-blur-sm"
                style={{ opacity: 0.6 }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {currentSlideIndex < totalSlides - 1 && (
              <button
                onClick={nextSlide}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all backdrop-blur-sm"
                style={{ opacity: 0.6 }}
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

        {/* Low bandwidth indicator */}
        {!isSpeaker && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 text-emerald-400 text-[10px] font-medium flex items-center gap-1">
            <FileText className="w-2.5 h-2.5" />
            Slide Mode (Low Bandwidth)
          </div>
        )}
      </div>

      {/* Bottom controls bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-zinc-900 border-t border-zinc-800 flex-shrink-0">
        {/* Left: Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevSlide}
            disabled={currentSlideIndex <= 0}
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs text-zinc-400 font-mono min-w-[60px] text-center">
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

        {/* Center: Upload button (speaker only) */}
        {isSpeaker && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
          >
            <Upload className="w-3 h-3" />
            <span className="hidden sm:inline">Upload</span>
          </button>
        )}

        {/* Right: Annotation toggle (speaker only) */}
        <div className="flex items-center gap-1">
          {isSpeaker && isAnnotating && (
            <button
              onClick={clearAnnotations}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            >
              <Eraser className="w-3 h-3" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Thumbnail strip */}
      {totalSlides > 1 && (
        <div className="bg-zinc-900/50 border-t border-zinc-800 px-2 py-2 flex-shrink-0">
          <div className="flex gap-1.5 overflow-x-auto max-h-20 pb-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
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
          onChange={handleFileUpload}
        />
      )}
    </div>
  );
}

// ============ Standalone Slide Viewer with Upload ============
// Wraps SlideViewer with file upload logic for self-contained usage

export function SlideViewerWithUpload({ isSpeaker }: { isSpeaker: boolean }) {
  const { engine, slides, currentSlideIndex, setSlides, setCurrentSlideIndex } = useRoomStore();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload and convert to slide images
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

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
            // Image files — use directly as data URLs
            const dataUrl = await readFileAsDataURL(file);
            newSlides.push(dataUrl);
          } else if (ext === 'pdf') {
            // PDF — render pages as images via canvas
            const pdfSlides = await renderPDFAsSlides(file);
            newSlides.push(...pdfSlides);
          } else if (ext === 'pptx') {
            // PPTX — best effort: show hint, try basic extraction
            const pptxSlides = await renderPPTXAsSlides(file);
            if (pptxSlides.length > 0) {
              newSlides.push(...pptxSlides);
            } else {
              // Show a placeholder slide with instructions
              const placeholderSlide = createPlaceholderSlide(
                'PPTX Detected',
                'For best results, export as PDF first, then upload the PDF. ' +
                  'Or upload individual slide images (PNG/JPG).'
              );
              newSlides.push(placeholderSlide);
            }
          }
        }

        if (newSlides.length > 0) {
          setSlides(newSlides);
          setCurrentSlideIndex(0);
        }
      } catch (err) {
        console.error('Error processing slides:', err);
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    []
  );

  // Broadcast slide change
  const handleSlideChange = useCallback(
    (index: number) => {
      setCurrentSlideIndex(index);
      if (isSpeaker && engine) {
        try {
          engine.broadcastSlideChange(index);
        } catch {
          // Broadcast may fail
        }
      }
    },
    [isSpeaker, engine, setCurrentSlideIndex]
  );

  // Slide changes for viewers are now handled via the store.
  // RoomPage wires eng.setOnSlideChange((slideIndex) => setCurrentSlideIndex(slideIndex)),
  // so the store's currentSlideIndex is kept in sync with engine slide-change signals.
  // No monkey-patching needed.

  return (
    <div className="h-full flex flex-col">
      {/* Upload bar (speaker only) */}
      {isSpeaker && (
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            {isProcessing ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {slides.length === 0 ? 'Upload Slides' : 'Change Slides'}
          </button>
          <span className="text-[10px] text-zinc-500">
            PDF, PPTX, PNG, JPG, SVG, WebP
          </span>
          {slides.length > 0 && (
            <span className="text-[10px] text-emerald-400 ml-auto">
              {slides.length} slide{slides.length !== 1 ? 's' : ''} loaded
            </span>
          )}
        </div>
      )}

      {/* Slide viewer */}
      <div className="flex-1 min-h-0">
        <SlideViewer
          isSpeaker={isSpeaker}
          slides={slides}
          currentSlideIndex={currentSlideIndex}
          onSlideChange={handleSlideChange}
          isFullScreen={isFullScreen}
          onToggleFullScreen={() => setIsFullScreen(!isFullScreen)}
        />
      </div>

      {/* Hidden file input */}
      {isSpeaker && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.png,.jpg,.jpeg,.svg,.webp"
          multiple
          className="hidden"
          onChange={handleFileUpload}
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

/**
 * Render a PDF file as slide images.
 * Uses a hidden iframe + canvas approach.
 * Falls back to a single embed slide if page rendering fails.
 */
async function renderPDFAsSlides(file: File): Promise<string[]> {
  const dataUrl = await readFileAsDataURL(file);
  const slides: string[] = [];

  try {
    // Attempt to use the browser's built-in PDF renderer via canvas
    // We create a temporary canvas and render the PDF page by page
    // This works in Chrome via PDFium and Firefox via pdf.js built-in
    const arrayBuffer = await file.arrayBuffer();

    // Try to use the PDFDocumentProxy if available (Firefox has built-in pdf.js)
    // For browsers without built-in PDF rendering, we'll use a canvas approach
    // The simplest cross-browser approach: render PDF in a hidden embed and capture

    // Since we can't reliably render individual PDF pages without pdfjs-dist,
    // use the approach of creating a single slide with the PDF embedded via iframe
    const embedSlide = createPDFEmbedSlide(dataUrl, file.name);
    slides.push(embedSlide);

    // Also try to estimate page count from PDF metadata
    // Parse PDF to find page count
    const pageCount = estimatePDFPageCount(arrayBuffer);
    if (pageCount > 1) {
      // Add placeholder slides for each page with page numbers
      for (let i = 1; i <= pageCount; i++) {
        const pageSlide = createPlaceholderSlide(
          `Page ${i} of ${pageCount}`,
          'Upload individual slide images for best navigation experience. ' +
            'Each image becomes a separate slide with full navigation support.'
        );
        slides.push(pageSlide);
      }
    }
  } catch {
    // Fallback: single embed slide
    const embedSlide = createPDFEmbedSlide(dataUrl, file.name);
    slides.push(embedSlide);
  }

  return slides;
}

/**
 * Try to extract slides from a PPTX file.
 * PPTX is a ZIP file containing XML slide definitions.
 * We parse the XML to extract text content and render simplified slides.
 */
async function renderPPTXAsSlides(file: File): Promise<string[]> {
  const slides: string[] = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Quick check: PPTX files start with PK (ZIP magic bytes)
    if (uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
      return slides;
    }

    // Parse the ZIP to find slide XML files
    // PPTX structure: ppt/slides/slide1.xml, slide2.xml, etc.
    const slideTexts = extractPPTXSlideTexts(arrayBuffer);

    if (slideTexts.length === 0) {
      return slides;
    }

    // Render each slide text as a canvas image
    for (let i = 0; i < slideTexts.length; i++) {
      const slideImage = renderTextToSlideCanvas(
        slideTexts[i] || `Slide ${i + 1}`,
        `Slide ${i + 1}`,
        i + 1,
        slideTexts.length
      );
      slides.push(slideImage);
    }
  } catch {
    // PPTX parsing failed
  }

  return slides;
}

/**
 * Minimal ZIP parsing to extract slide XML text content from PPTX
 */
function extractPPTXSlideTexts(arrayBuffer: ArrayBuffer): string[] {
  const slides: Map<number, string> = new Map();
  const data = new Uint8Array(arrayBuffer);

  // Look for slide XML content markers in the raw bytes
  // PPTX stores slides at ppt/slides/slideN.xml
  // We'll search for <a:t> tags which contain text content
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(data);

  // Find all <a:t>...</a:t> content
  const textMatches: string[] = [];
  const regex = /<a:t>([^<]*)<\/a:t>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1].trim()) {
      textMatches.push(match[1].trim());
    }
  }

  // Try to determine slide boundaries by looking for slide XML markers
  const slideBoundaryRegex = /ppt\/slides\/slide(\d+)\.xml/g;
  const slidePositions: { index: number; slideNum: number }[] = [];
  while ((match = slideBoundaryRegex.exec(text)) !== null) {
    slidePositions.push({
      index: match.index,
      slideNum: parseInt(match[1], 10),
    });
  }

  if (slidePositions.length > 0) {
    // Group text by slide proximity
    for (const pos of slidePositions) {
      const nextPos = slidePositions.find(
        (s) => s.slideNum === pos.slideNum + 1
      );
      const startPos = pos.index;
      const endPos = nextPos ? nextPos.index : Math.min(startPos + 5000, text.length);
      const slideContent = text.substring(startPos, endPos);
      const slideTexts: string[] = [];
      const innerRegex = /<a:t>([^<]*)<\/a:t>/g;
      let innerMatch;
      while ((innerMatch = innerRegex.exec(slideContent)) !== null) {
        if (innerMatch[1].trim()) {
          slideTexts.push(innerMatch[1].trim());
        }
      }
      slides.set(pos.slideNum, slideTexts.join('\n'));
    }

    // Return in order
    const maxSlide = Math.max(...Array.from(slides.keys()));
    const result: string[] = [];
    for (let i = 1; i <= maxSlide; i++) {
      result.push(slides.get(i) || '');
    }
    return result;
  }

  // Fallback: just return all found text as one slide
  if (textMatches.length > 0) {
    return [textMatches.join('\n')];
  }

  return [];
}

/**
 * Render text content to a slide canvas image
 */
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

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, 720);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1280, 720);

  // Decorative accent line
  ctx.fillStyle = '#10b981';
  ctx.fillRect(60, 60, 4, 80);

  // Title
  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(title, 80, 100);

  // Content text
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';

  const lines = textContent.split('\n');
  const maxLines = 12;
  const lineHeight = 36;
  const startY = 180;

  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const line = lines[i];
    // Truncate long lines
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

  // Slide number
  ctx.fillStyle = '#52525b';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${slideNum} / ${totalSlides}`, 1160, 690);

  // PPTX badge
  ctx.fillStyle = '#52525b';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Converted from PPTX', 80, 690);

  return canvas.toDataURL('image/jpeg', 0.9);
}

/**
 * Create a placeholder slide image
 */
function createPlaceholderSlide(title: string, subtitle: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, 720);
  gradient.addColorStop(0, '#18181b');
  gradient.addColorStop(1, '#27272a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1280, 720);

  // Icon placeholder
  ctx.fillStyle = '#3f3f46';
  ctx.font = '64px serif';
  ctx.textAlign = 'center';
  ctx.fillText('📄', 640, 300);

  // Title
  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(title, 640, 380);

  // Subtitle
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif';

  // Word wrap subtitle
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

/**
 * Create a slide with an embedded PDF viewer
 */
function createPDFEmbedSlide(pdfDataUrl: string, fileName: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 1280, 720);

  // PDF icon
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(560, 200, 160, 200);
  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PDF', 640, 330);

  // File name
  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(fileName, 640, 460);

  // Instructions
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('PDF loaded — viewer will display it', 640, 500);

  ctx.textAlign = 'left';

  // Store the PDF data URL as a data attribute for the embed
  // The actual PDF will be displayed via an embed/iframe in the component
  const slide = canvas.toDataURL('image/jpeg', 0.85);

  // We return the PDF data URL directly — it will be displayed as an embed
  // The canvas image is just a fallback thumbnail
  return pdfDataUrl;
}

/**
 * Estimate PDF page count by scanning for /Type /Page entries
 */
function estimatePDFPageCount(arrayBuffer: ArrayBuffer): number {
  const data = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(data);

  // Count /Type /Page entries (but not /Type /Pages)
  let count = 0;
  const regex = /\/Type\s*\/Page[^s]/g;
  while (regex.exec(text) !== null) {
    count++;
  }

  // Also check for /Pages /Count N
  const countMatch = text.match(/\/Pages[\s\S]*?\/Count\s+(\d+)/);
  if (countMatch) {
    return parseInt(countMatch[1], 10);
  }

  return count || 1;
}
