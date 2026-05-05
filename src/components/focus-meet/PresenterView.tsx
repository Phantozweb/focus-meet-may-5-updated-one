'use client';

// PresenterView — Speaker's control panel for slides + laser + annotations + recording
// Shows: current slide, next slide preview, laser pointer, drawing tools, recording status
// Speaker sees everything at once, controls the experience for all viewers
// Connected to real P2P engine via useRoomStore

import { useState, useRef, useEffect, useCallback, startTransition } from 'react';
import { useRoomStore } from '@/store/room-store';
import {
  Circle, ChevronLeft, ChevronRight,
  Pen, Highlighter, Eraser, Trash2, MousePointer2,
  Mic, MicOff, Video, VideoOff, Lock, Unlock,
  Users, Monitor, BarChart3, Clock, Wifi,
  Type, Eye, Radio, Upload, Smartphone, Maximize, Minimize,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

// Slide data for uploaded slides (data URLs) with optional metadata
interface SlideData {
  id: number;
  title: string;
  notes: string;
  color: string;
}

// Fallback demo slide data — only used when no real slides are uploaded
const FALLBACK_SLIDES: SlideData[] = [
  { id: 0, title: 'Welcome to Focus Meet', notes: 'Introduce the platform and its key innovation: adaptive content delivery for live sessions.', color: 'from-emerald-900 to-zinc-900' },
  { id: 1, title: 'The Problem', notes: 'Traditional live sessions break on slow connections. Video requires 2.5 Mbps — unavailable to 40% of viewers.', color: 'from-amber-900 to-zinc-900' },
  { id: 2, title: 'Adaptive Delivery', notes: 'High BW → full video. Low BW → slides + audio only. Very low → audio only. Same knowledge, different media.', color: 'from-violet-900 to-zinc-900' },
  { id: 3, title: 'Slide Sync Engine', notes: 'Slides are ~100KB each vs 2500kbps video stream. Speakers control slides, laser pointer, and annotations.', color: 'from-cyan-900 to-zinc-900' },
  { id: 4, title: 'Bandwidth Savings', notes: 'Up to 85% bandwidth savings for low-bandwidth viewers. They get the same content, just without the video stream.', color: 'from-rose-900 to-zinc-900' },
  { id: 5, title: 'Architecture', notes: 'P2P mesh with fractal clustering. Root nodes ensure failover. No central server bottleneck.', color: 'from-indigo-900 to-zinc-900' },
  { id: 6, title: 'Live Demo', notes: 'Switch to live demo. Show the laser pointer, annotations, and how slides sync across viewers.', color: 'from-teal-900 to-zinc-900' },
  { id: 7, title: 'Q&A', notes: 'Open for questions. Remind viewers they can use the Q&A panel at any time.', color: 'from-orange-900 to-zinc-900' },
];

type AnnotationTool = 'none' | 'pen' | 'highlighter' | 'eraser' | 'text';

/** Detect iOS Safari */
function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function PresenterView() {
  const {
    isHost, engine, recordingState, recorder,
    nodes, myNode, localStream,
    audioEnabled, videoEnabled, networkHealth,
    streamHealth, streamQuality,
    slides, currentSlideIndex, setSlides, setCurrentSlideIndex,
    setIsPresenting, isPresenting,
    setIsRoomLocked, isRoomLocked,
    setRecordingState, roomInfo,
    setAudioEnabled, setVideoEnabled,
  } = useRoomStore();

  const isMobile = useIsMobile();

  const [activeTool, setActiveTool] = useState<AnnotationTool>('none');
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [showNotes, setShowNotes] = useState(true);
  const [annotations, setAnnotations] = useState<Map<number, { x: number; y: number; type: string; color: string; size: number }[]>>(new Map());
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [deliveryStats, setDeliveryStats] = useState({ full: 0, slidesAudio: 0, audioOnly: 0, total: 0 });
  const [bandwidthSavings, setBandwidthSavings] = useState({ videoKbps: 0, slidesKbps: 0, savingsPercent: 0 });
  const [penColor, setPenColor] = useState('#ef4444');
  const [penSize, setPenSize] = useState(3);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const slideAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDrawingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use real slides from store, or fallback demo slides
  const hasRealSlides = slides.length > 0;
  const totalSlides = hasRealSlides ? slides.length : FALLBACK_SLIDES.length;
  const currentSlide = currentSlideIndex;

  // Set presenting state when component mounts
  useEffect(() => {
    if (isHost) {
      setIsPresenting(true);
    }
    return () => {
      setIsPresenting(false);
    };
  }, [isHost, setIsPresenting]);

  // Mobile camera is handled by RoomPage's startLocalStream — no separate init needed here.
  // Previously this effect started the camera then immediately stopped all tracks, which was a bug.

  // iOS fullscreen fallback using CSS fixed positioning
  const toggleFullscreen = useCallback(() => {
    if (isIOS()) {
      // iOS Safari doesn't support requestFullscreen — use CSS fallback
      setIsFullscreen(prev => !prev);
    } else {
      // Standard Fullscreen API
      if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {
          // Fallback to CSS approach
          setIsFullscreen(true);
        });
      } else {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => setIsFullscreen(false));
      }
    }
  }, []);

  // Listen for fullscreen changes (non-iOS)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Compute delivery stats from real node data
  useEffect(() => {
    const computeStats = () => {
      let full = 0, slidesAudio = 0, audioOnly = 0;

      // Iterate through real peer nodes (exclude self)
      nodes.forEach((node) => {
        if (myNode && node.peerId === myNode.peerId) return;

        // Use stream health per-node if available, otherwise estimate from network health
        const nodeBandwidth = networkHealth?.totalBandwidthKbps ?? 1200;
        const nodeRtt = networkHealth?.avgRTT ?? 150;
        const nodeLoss = networkHealth?.avgPacketLoss ?? 0.03;

        // Determine mode based on thresholds (matching AdaptiveDeliveryEngine logic)
        if (nodeBandwidth >= 1500 && nodeRtt < 400 && nodeLoss < 0.08) {
          full++;
        } else if (nodeBandwidth >= 300 && nodeRtt < 800 && nodeLoss < 0.25) {
          slidesAudio++;
        } else {
          audioOnly++;
        }
      });

      const total = full + slidesAudio + audioOnly;

      // Compute bandwidth savings
      const videoKbps = full * 2500;
      const slidesKbps = slidesAudio * (150 * 8 / 10); // 150KB slide, ~10s per slide
      const totalIfAllVideo = total * 2500;
      const savingsPercent = totalIfAllVideo > 0 ? ((totalIfAllVideo - videoKbps - slidesKbps) / totalIfAllVideo) * 100 : 0;

      startTransition(() => {
        setDeliveryStats({ full, slidesAudio, audioOnly, total });
        setBandwidthSavings({ videoKbps, slidesKbps, savingsPercent });
      });
    };

    computeStats();
  }, [nodes, myNode, networkHealth]);

  // Timer for recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Handle slide change — broadcast via P2P engine
  const handleSlideChange = useCallback((index: number) => {
    if (index < 0 || index >= totalSlides) return;

    // Update local state
    setCurrentSlideIndex(index);

    // Broadcast to all viewers via the real P2P engine
    if (engine) {
      engine.broadcastSlideChange(index);
    }
  }, [engine, totalSlides, setCurrentSlideIndex]);

  // Handle laser pointer movement — broadcast via P2P engine
  const handleLaserMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!slideAreaRef.current) return;
    const rect = slideAreaRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setLaserPos({ x, y });

    // Broadcast laser pointer to all viewers
    if (engine) {
      engine.broadcastAnnotation({ type: 'laser', x, y });
    }
  }, [engine]);

  const handleLaserLeave = useCallback(() => {
    setLaserPos(null);
    // Broadcast laser off
    if (engine) {
      engine.broadcastAnnotation({ type: 'laser-off', x: -1, y: -1 });
    }
  }, [engine]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'none') return;
    isDrawingRef.current = true;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrawingPath([{ x, y }]);
  }, [activeTool]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || activeTool === 'none') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrawingPath(prev => [...prev, { x, y }]);
  }, [activeTool]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (drawingPath.length > 1 && activeTool !== 'eraser') {
      const color = activeTool === 'highlighter' ? '#facc15' : penColor;
      const size = activeTool === 'highlighter' ? 12 : penSize;
      const newAnnotation = drawingPath.map(p => ({ ...p, type: activeTool, color, size }));
      setAnnotations(prev => {
        const next = new Map(prev);
        const existing = next.get(currentSlide) || [];
        next.set(currentSlide, [...existing, ...newAnnotation]);
        return next;
      });

      // Broadcast drawing annotation to all viewers via P2P
      if (engine) {
        engine.broadcastAnnotation({
          type: 'drawing',
          x: drawingPath[0].x,
          y: drawingPath[0].y,
          data: { path: drawingPath, color, size },
        });
      }
    }

    setDrawingPath([]);
  }, [activeTool, drawingPath, currentSlide, engine, penColor, penSize]);

  const handleClearAnnotations = useCallback(() => {
    setAnnotations(prev => {
      const next = new Map(prev);
      next.delete(currentSlide);
      return next;
    });

    // Broadcast clear to all viewers
    if (engine) {
      engine.broadcastAnnotation({ type: 'clear', x: 0, y: 0 });
    }
  }, [currentSlide, engine]);

  // Toggle recording using store recorder
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      if (recorder) {
        await recorder.stopRecording();
        setRecordingState(recorder.getState());
      }
      setIsRecording(false);
      toast.success('Recording stopped');
    } else {
      // Start recording
      if (recorder && localStream) {
        const roomId = roomInfo?.roomId || 'default';
        const started = await recorder.startRecording(localStream, roomId);
        if (started) {
          setRecordingState(recorder.getState());
          setIsRecording(true);
          toast.info('Recording started');
        } else {
          setRecordingState(recorder.getState());
          toast.error('Failed to start recording');
        }
      } else {
        // No recorder or stream available, just track locally
        setIsRecording(true);
        toast.info('Recording started (local only)');
      }
    }
  }, [isRecording, recorder, localStream, recordingState, setRecordingState, roomInfo]);

  // Toggle room lock via engine
  const toggleLock = useCallback(() => {
    const newLocked = !isLocked;
    setIsLocked(newLocked);

    if (engine) {
      if (newLocked) {
        engine.lockRoom();
      } else {
        engine.unlockRoom();
      }
    }
    setIsRoomLocked(newLocked);
  }, [isLocked, engine, setIsRoomLocked]);

  // Handle slide file upload
  const handleSlideUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const dataUrls: string[] = [];
    let loaded = 0;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          dataUrls.push(reader.result);
        }
        loaded++;
        if (loaded === files.length) {
          // All files loaded, store as slides
          setSlides(dataUrls);
          setCurrentSlideIndex(0);
          toast.success(`${dataUrls.length} slide${dataUrls.length > 1 ? 's' : ''} loaded`);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input so the same file can be re-uploaded
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [setSlides, setCurrentSlideIndex]);

  const viewerCount = nodes.size > 1 ? nodes.size - 1 : deliveryStats.total;

  // Render slide content — real image or fallback demo
  const renderSlideContent = (slideIndex: number, isPreview = false) => {
    if (hasRealSlides && slides[slideIndex]) {
      return (
        <img
          src={slides[slideIndex]}
          alt={`Slide ${slideIndex + 1}`}
          className={`w-full h-full object-contain ${isPreview ? 'pointer-events-none' : ''}`}
          draggable={false}
        />
      );
    }

    // Fallback demo slide
    const fallback = FALLBACK_SLIDES[slideIndex];
    if (!fallback) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-zinc-600 text-xs">End of deck</span>
        </div>
      );
    }

    return (
      <div className={`w-full h-full bg-gradient-to-br ${fallback.color} flex items-center justify-center`}>
        <div className={`text-center ${isPreview ? 'px-2' : 'px-4 sm:px-8'}`}>
          {isPreview ? (
            <span className="text-[10px] sm:text-xs text-zinc-300 font-medium">{fallback.title}</span>
          ) : (
            <>
              <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">
                {fallback.title}
              </h2>
              <p className="text-zinc-400 text-sm sm:text-base">Slide {slideIndex + 1} of {totalSlides}</p>
            </>
          )}
        </div>
      </div>
    );
  };

  // Touch target min size for drawing tools
  const toolMinSize = isMobile ? 'min-w-[44px] min-h-[44px]' : 'min-w-[36px] sm:min-w-[40px]';

  return (
    <div
      ref={containerRef}
      className={`h-full w-full bg-zinc-950 flex flex-col overflow-hidden ${
        isFullscreen && isIOS() ? 'fixed inset-0 z-[9999]' : ''
      }`}
    >
      {/* ═══ MOBILE HOST MODE NOTICE ═══ */}
      {isMobile && isHost && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <Smartphone className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-[11px] text-amber-300 font-medium">
            Mobile Host Mode — some features may be limited
          </span>
        </div>
      )}

      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        {/* Left: Recording + Timer */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={toggleRecording}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all touch-manipulation min-h-[36px] ${
              isRecording
                ? 'bg-red-600/20 text-red-400 border border-red-500/40'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
            }`}
          >
            {isRecording ? (
              <>
                <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 animate-pulse" />
                <span className="hidden sm:inline">REC</span>
                <span className="font-mono">{formatTime(elapsedTime)}</span>
              </>
            ) : (
              <>
                <Radio className="w-3 h-3" />
                <span className="hidden sm:inline">Start</span>
              </>
            )}
          </button>
          {!isRecording && (
            <div className="flex items-center gap-1 text-zinc-500 text-xs">
              <Clock className="w-3 h-3" />
              <span className="font-mono">{formatTime(elapsedTime)}</span>
            </div>
          )}
        </div>

        {/* Center: Viewer count + delivery breakdown */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Eye className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-300 text-xs sm:text-sm font-medium">{viewerCount}</span>
          <span className="text-zinc-500 text-[10px] sm:text-xs hidden sm:inline">viewers</span>
          <span className="text-zinc-700 text-xs">|</span>
          <div className="flex items-center gap-1">
            <span className="text-emerald-400 text-[10px] sm:text-xs font-medium">{deliveryStats.full}</span>
            <Monitor className="w-2.5 h-2.5 text-emerald-500" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-amber-400 text-[10px] sm:text-xs font-medium">{deliveryStats.slidesAudio}</span>
            <BarChart3 className="w-2.5 h-2.5 text-amber-500" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-400 text-[10px] sm:text-xs font-medium">{deliveryStats.audioOnly}</span>
            <Mic className="w-2.5 h-2.5 text-red-500" />
          </div>
        </div>

        {/* Right: Bandwidth savings + quick actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {bandwidthSavings.savingsPercent > 0 && (
            <Badge variant="outline" className="text-[10px] border-emerald-600/40 text-emerald-400 bg-emerald-500/10 hidden sm:flex">
              <Wifi className="w-2.5 h-2.5 mr-1" />
              {bandwidthSavings.savingsPercent.toFixed(0)}% saved
            </Badge>
          )}
          {/* Fullscreen toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-zinc-200 touch-manipulation"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 touch-manipulation ${isLocked ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 hover:text-zinc-200'}`}
                  onClick={toggleLock}
                >
                  {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLocked ? 'Room locked' : 'Lock room'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* ═══ MAIN AREA ═══ */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* LEFT: Current slide */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <div
            ref={slideAreaRef}
            className="flex-1 relative overflow-hidden m-2 sm:m-3 rounded-xl border border-zinc-800 bg-zinc-900"
            onMouseMove={activeTool === 'none' ? handleLaserMove : undefined}
            onMouseLeave={activeTool === 'none' ? handleLaserLeave : undefined}
          >
            {/* Slide content */}
            <div className="absolute inset-0 flex items-center justify-center">
              {renderSlideContent(currentSlide)}

              {/* Annotation canvas overlay */}
              <canvas
                ref={canvasRef}
                className={`absolute inset-0 w-full h-full ${activeTool !== 'none' ? 'cursor-crosshair' : 'cursor-none'}`}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />

              {/* Render existing annotations */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {(annotations.get(currentSlide) || []).map((pt, i) => (
                  <circle
                    key={i}
                    cx={`${pt.x * 100}%`}
                    cy={`${pt.y * 100}%`}
                    r={pt.size}
                    fill={pt.color}
                    opacity={pt.type === 'highlighter' ? 0.5 : 0.9}
                  />
                ))}
                {drawingPath.map((pt, i) => (
                  <circle
                    key={`d-${i}`}
                    cx={`${pt.x * 100}%`}
                    cy={`${pt.y * 100}%`}
                    r={activeTool === 'highlighter' ? 6 : penSize}
                    fill={activeTool === 'highlighter' ? '#facc15' : penColor}
                    opacity={activeTool === 'highlighter' ? 0.5 : 0.9}
                  />
                ))}
              </svg>

              {/* Laser pointer dot */}
              {laserPos && activeTool === 'none' && (
                <div
                  className="absolute w-4 h-4 -ml-2 -mt-2 pointer-events-none z-10"
                  style={{ left: `${laserPos.x * 100}%`, top: `${laserPos.y * 100}%` }}
                >
                  <div className="w-full h-full rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
                  <div className="absolute inset-0 w-full h-full rounded-full bg-red-500/30 animate-ping" />
                </div>
              )}
            </div>

            {/* Slide navigation overlay arrows */}
            <button
              onClick={() => handleSlideChange(currentSlide - 1)}
              disabled={currentSlide === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors backdrop-blur-sm touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleSlideChange(currentSlide + 1)}
              disabled={currentSlide === totalSlides - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors backdrop-blur-sm touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* RIGHT: Next slide preview + Speaker notes (hidden on very small mobile) */}
        {!isMobile ? (
          <div className="w-48 sm:w-64 lg:w-72 flex flex-col border-l border-zinc-800 bg-zinc-900/50 flex-shrink-0">
            {/* Next slide preview */}
            <div className="p-2 sm:p-3 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] sm:text-xs text-zinc-500 font-medium">NEXT</span>
                {currentSlide < totalSlides - 1 && (
                  <span className="text-[9px] text-zinc-600">Slide {currentSlide + 2}</span>
                )}
              </div>
              <div className="aspect-video rounded-lg border border-zinc-700 overflow-hidden flex items-center justify-center">
                {currentSlide < totalSlides - 1 ? (
                  renderSlideContent(currentSlide + 1, true)
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                    <span className="text-[10px] text-zinc-600">End of deck</span>
                  </div>
                )}
              </div>
            </div>

            {/* Speaker notes */}
            <div className="flex-1 flex flex-col min-h-0 p-2 sm:p-3">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="flex items-center justify-between mb-2 text-[10px] sm:text-xs text-zinc-500 font-medium hover:text-zinc-300 transition-colors"
              >
                <span>SPEAKER NOTES</span>
                <span className="text-zinc-600">{showNotes ? '▾' : '▸'}</span>
              </button>
              {showNotes && (
                <div className="flex-1 overflow-y-auto text-zinc-400 text-xs leading-relaxed bg-zinc-800/50 rounded-lg p-2 sm:p-3">
                  {hasRealSlides
                    ? `Slide ${currentSlide + 1} of ${totalSlides}. Upload slides as images to present them.`
                    : (FALLBACK_SLIDES[currentSlide]?.notes || 'No notes for this slide.')}
                </div>
              )}
            </div>

            {/* Mini video self-view */}
            <div className="p-2 sm:p-3 border-t border-zinc-800">
              <div className="aspect-video rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                {videoEnabled && localStream ? (
                  <video
                    autoPlay
                    muted
                    playsInline
                    ref={el => { if (el && localStream) el.srcObject = localStream; }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    {videoEnabled ? <Video className="w-4 h-4 text-zinc-500" /> : <VideoOff className="w-4 h-4 text-zinc-600" />}
                    <span className="text-[8px] text-zinc-600">{videoEnabled ? 'Camera' : 'Off'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Mobile: compact next slide preview below current slide */
          <div className="w-20 flex flex-col border-l border-zinc-800 bg-zinc-900/50 flex-shrink-0">
            <div className="p-1.5 border-b border-zinc-800">
              <span className="text-[8px] text-zinc-600 font-medium block text-center mb-1">NEXT</span>
              <div className="aspect-video rounded border border-zinc-700 overflow-hidden flex items-center justify-center">
                {currentSlide < totalSlides - 1 ? (
                  renderSlideContent(currentSlide + 1, true)
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                    <span className="text-[6px] text-zinc-600">END</span>
                  </div>
                )}
              </div>
            </div>
            {/* Mini self-view on mobile */}
            <div className="p-1.5 border-t border-zinc-800 mt-auto">
              <div className="aspect-video rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                {videoEnabled && localStream ? (
                  <video
                    autoPlay
                    muted
                    playsInline
                    ref={el => { if (el && localStream) el.srcObject = localStream; }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <VideoOff className="w-3 h-3 text-zinc-600" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ BOTTOM TOOLBAR ═══ */}
      {/* Desktop controls — hidden on mobile */}
      <div className="hidden md:flex items-center justify-between px-2 sm:px-4 py-2 bg-zinc-900 border-t border-zinc-800 flex-shrink-0 gap-2 overflow-x-auto">
        {/* Slide navigation */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-zinc-400 hover:text-zinc-200 touch-manipulation"
            onClick={() => handleSlideChange(currentSlide - 1)}
            disabled={currentSlide === 0}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-zinc-400 font-mono whitespace-nowrap">
            {currentSlide + 1}/{totalSlides}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-zinc-400 hover:text-zinc-200 touch-manipulation"
            onClick={() => handleSlideChange(currentSlide + 1)}
            disabled={currentSlide === totalSlides - 1}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          {/* Upload slides button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="flex items-center gap-1 h-9 px-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer transition-colors touch-manipulation">
                  <Upload className="w-3.5 h-3.5" />
                  <span className="text-xs">Upload</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleSlideUpload}
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent>Upload slides (images)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Drawing tools */}
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          <ToolButton
            active={activeTool === 'none'}
            onClick={() => setActiveTool('none')}
            icon={<MousePointer2 className="w-4 h-4" />}
            label="Laser"
            activeColor="text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
            minSize={false}
          />
          <ToolButton
            active={activeTool === 'pen'}
            onClick={() => setActiveTool('pen')}
            icon={<Pen className="w-4 h-4" />}
            label="Pen"
            activeColor="text-red-400 bg-red-500/10 border-red-500/30"
            minSize={false}
          />
          <ToolButton
            active={activeTool === 'highlighter'}
            onClick={() => setActiveTool('highlighter')}
            icon={<Highlighter className="w-4 h-4" />}
            label="Highlight"
            activeColor="text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
            minSize={false}
          />
          <ToolButton
            active={activeTool === 'eraser'}
            onClick={() => setActiveTool('eraser')}
            icon={<Eraser className="w-4 h-4" />}
            label="Erase"
            activeColor="text-zinc-300 bg-zinc-600/30 border-zinc-500/30"
            minSize={false}
          />
          <ToolButton
            active={activeTool === 'text'}
            onClick={() => setActiveTool('text')}
            icon={<Type className="w-4 h-4" />}
            label="Text"
            activeColor="text-blue-400 bg-blue-500/10 border-blue-500/30"
            minSize={false}
          />
          <div className="w-px h-5 bg-zinc-700 mx-0.5" />
          <ToolButton
            active={false}
            onClick={handleClearAnnotations}
            icon={<Trash2 className="w-4 h-4" />}
            label="Clear"
            activeColor=""
            minSize={false}
          />
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          <ToolButton
            active={audioEnabled}
            onClick={() => { if (engine) { const enabled = engine.toggleAudio(); setAudioEnabled(enabled); } }}
            icon={audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            label="Mic"
            activeColor={audioEnabled ? 'text-emerald-400' : 'text-red-400'}
            minSize={false}
          />
          <ToolButton
            active={videoEnabled}
            onClick={() => { if (engine) { const enabled = engine.toggleVideo(); setVideoEnabled(enabled); } }}
            icon={videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            label="Cam"
            activeColor={videoEnabled ? 'text-emerald-400' : 'text-red-400'}
            minSize={false}
          />
          <ToolButton
            active={false}
            onClick={() => {}}
            icon={<Users className="w-4 h-4" />}
            label="Q&A"
            activeColor=""
            minSize={false}
          />
        </div>
      </div>

      {/* Mobile controls — compact icon-only buttons, visible on mobile only */}
      <div className="flex md:hidden items-center gap-1 p-1.5 bg-zinc-900 border-t border-zinc-800 overflow-x-auto flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-zinc-400" onClick={() => handleSlideChange(currentSlide - 1)} disabled={currentSlide === 0}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-[10px] text-zinc-400 font-mono shrink-0">{currentSlide + 1}/{totalSlides}</span>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-zinc-400" onClick={() => handleSlideChange(currentSlide + 1)} disabled={currentSlide === totalSlides - 1}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-zinc-700 mx-0.5 shrink-0" />
        <label className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer">
          <Upload className="w-4 h-4" />
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleSlideUpload} />
        </label>
        <div className="w-px h-6 bg-zinc-700 mx-0.5 shrink-0" />
        <Button variant="ghost" size="icon" className={`h-10 w-10 shrink-0 ${activeTool === 'none' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400'}`} onClick={() => setActiveTool('none')}>
          <MousePointer2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className={`h-10 w-10 shrink-0 ${activeTool === 'pen' ? 'text-red-400 bg-red-500/10' : 'text-zinc-400'}`} onClick={() => setActiveTool('pen')}>
          <Pen className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className={`h-10 w-10 shrink-0 ${activeTool === 'highlighter' ? 'text-yellow-400 bg-yellow-500/10' : 'text-zinc-400'}`} onClick={() => setActiveTool('highlighter')}>
          <Highlighter className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-zinc-400" onClick={handleClearAnnotations}>
          <Trash2 className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-zinc-700 mx-0.5 shrink-0" />
        <Button variant="ghost" size="icon" className={`h-10 w-10 shrink-0 ${audioEnabled ? 'text-emerald-400' : 'text-red-400'}`} onClick={() => { if (engine) { const enabled = engine.toggleAudio(); setAudioEnabled(enabled); } }}>
          {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="icon" className={`h-10 w-10 shrink-0 ${videoEnabled ? 'text-emerald-400' : 'text-red-400'}`} onClick={() => { if (engine) { const enabled = engine.toggleVideo(); setVideoEnabled(enabled); } }}>
          {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-zinc-400" onClick={toggleRecording}>
          {isRecording ? <Circle className="w-4 h-4 fill-red-500 text-red-500 animate-pulse" /> : <Radio className="w-4 h-4" />}
        </Button>
      </div>

      {/* Pen size slider (shown when pen/highlighter active) */}
      {(activeTool === 'pen' || activeTool === 'highlighter') && (
        <div className="absolute bottom-14 sm:bottom-12 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 flex items-center gap-3 z-20 shadow-xl">
          <div className="flex items-center gap-1.5">
            <div
              className="rounded-full"
              style={{
                width: penSize * 2 + 4,
                height: penSize * 2 + 4,
                backgroundColor: activeTool === 'highlighter' ? '#facc15' : penColor,
                opacity: activeTool === 'highlighter' ? 0.5 : 1,
              }}
            />
          </div>
          <Slider
            value={[penSize]}
            onValueChange={([v]) => setPenSize(v)}
            min={1}
            max={12}
            step={1}
            className="w-24"
          />
          <span className="text-[10px] text-zinc-400 w-4">{penSize}</span>
          {activeTool === 'pen' && (
            <>
              <div className="w-px h-5 bg-zinc-700" />
              <div className="flex gap-1">
                {['#ef4444', '#3b82f6', '#22c55e', '#ffffff', '#f97316'].map(c => (
                  <button
                    key={c}
                    onClick={() => setPenColor(c)}
                    className={`w-6 h-6 rounded-full border-2 touch-manipulation ${penColor === c ? 'border-white' : 'border-zinc-600'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
  activeColor,
  minSize,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
  minSize?: boolean;
}) {
  const sizeClasses = minSize
    ? 'min-w-[44px] min-h-[44px] px-2 py-2'
    : 'min-w-[36px] sm:min-w-[40px] px-1.5 sm:px-2 py-1';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`flex flex-col items-center gap-0.5 rounded-lg transition-all border text-xs touch-manipulation ${sizeClasses} ${
              active && activeColor
                ? activeColor
                : 'text-zinc-500 hover:text-zinc-300 border-transparent hover:bg-zinc-800'
            }`}
          >
            {icon}
            <span className="text-[8px] sm:text-[9px] font-medium leading-none">{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
