'use client';

// PresenterView — Speaker's control panel for slides + laser + annotations + recording
// Shows: current slide, next slide preview, laser pointer, drawing tools, recording status
// Speaker sees everything at once, controls the experience for all viewers

import { useState, useRef, useEffect, useCallback, startTransition } from 'react';
import { useRoomStore } from '@/store/room-store';
import {
  AdaptiveDeliveryEngine,
  DeliveryMode,
  SlideSyncMessage,
  ViewerDeliveryProfile,
} from '@/lib/adaptive-delivery';
import {
  Circle, Pause, Play, ChevronLeft, ChevronRight,
  Pen, Highlighter, Eraser, Trash2, MousePointer2,
  Mic, MicOff, Video, VideoOff, Lock, Unlock,
  Users, Monitor, BarChart3, Clock, Wifi,
  Type, X, Eye, Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';

// Demo slide data — in production, these would be loaded from PPTX upload
interface SlideData {
  id: number;
  title: string;
  notes: string;
  color: string;
}

const DEMO_SLIDES: SlideData[] = [
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

export function PresenterView() {
  const {
    isHost, recordingState, nodes, myNode, localStream,
    audioEnabled, videoEnabled, networkHealth,
  } = useRoomStore();

  const [engine] = useState(() => new AdaptiveDeliveryEngine());
  const [currentSlide, setCurrentSlide] = useState(0);
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

  const slideAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDrawingRef = useRef(false);

  const totalSlides = DEMO_SLIDES.length;

  // Simulate some viewer profiles for demo
  useEffect(() => {
    const demoPeers = [
      { id: 'v1', kbps: 2500, rtt: 80, loss: 0.02 },
      { id: 'v2', kbps: 1800, rtt: 120, loss: 0.03 },
      { id: 'v3', kbps: 800, rtt: 300, loss: 0.06 },
      { id: 'v4', kbps: 500, rtt: 450, loss: 0.10 },
      { id: 'v5', kbps: 200, rtt: 900, loss: 0.30 },
      { id: 'v6', kbps: 3000, rtt: 50, loss: 0.01 },
      { id: 'v7', kbps: 400, rtt: 600, loss: 0.15 },
      { id: 'v8', kbps: 1600, rtt: 150, loss: 0.05 },
      { id: 'v9', kbps: 100, rtt: 1200, loss: 0.40 },
      { id: 'v10', kbps: 2200, rtt: 90, loss: 0.02 },
    ];
    demoPeers.forEach(p => engine.updateViewerProfile(p.id, { kbps: p.kbps, rttMs: p.rtt, packetLoss: p.loss }));
    const stats = engine.getDeliveryStats();
    const savings = engine.getBandwidthSavings();
    startTransition(() => {
      setDeliveryStats(stats);
      setBandwidthSavings(savings);
    });
  }, [engine]);

  // Timer
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

  const handleSlideChange = useCallback((index: number) => {
    if (index < 0 || index >= totalSlides) return;
    setCurrentSlide(index);
    const msg = engine.changeSlide(index);
    // In production, broadcast msg via peer connection
    void msg;
  }, [engine, totalSlides]);

  const handleLaserMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!slideAreaRef.current) return;
    const rect = slideAreaRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setLaserPos({ x, y });
    const msg = engine.updateLaser(x, y);
    void msg;
  }, [engine]);

  const handleLaserLeave = useCallback(() => {
    setLaserPos(null);
  }, []);

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
      const msg = engine.addAnnotation({
        x: drawingPath[0].x,
        y: drawingPath[0].y,
        type: activeTool === 'highlighter' ? 'draw' : activeTool === 'text' ? 'text' : 'draw',
        data: { path: drawingPath, color, size },
      });
      void msg;
    }

    setDrawingPath([]);
  }, [activeTool, drawingPath, currentSlide, engine, penColor, penSize]);

  const handleClearAnnotations = useCallback(() => {
    setAnnotations(prev => {
      const next = new Map(prev);
      next.delete(currentSlide);
      return next;
    });
    const msg = engine.clearAnnotations();
    void msg;
  }, [currentSlide, engine]);

  const toggleRecording = useCallback(() => {
    setIsRecording(prev => !prev);
  }, []);

  const toggleLock = useCallback(() => {
    setIsLocked(prev => !prev);
  }, []);

  const viewerCount = nodes.size > 0 ? nodes.size - 1 : deliveryStats.total;

  return (
    <div className="h-full w-full bg-zinc-950 flex flex-col overflow-hidden">
      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        {/* Left: Recording + Timer */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={toggleRecording}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-lg text-xs font-medium transition-all ${
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${isLocked ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 hover:text-zinc-200'}`}
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
            <div className={`absolute inset-0 bg-gradient-to-br ${DEMO_SLIDES[currentSlide]?.color || 'from-zinc-800 to-zinc-900'} flex items-center justify-center`}>
              <div className="text-center px-4 sm:px-8">
                <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">
                  {DEMO_SLIDES[currentSlide]?.title || `Slide ${currentSlide + 1}`}
                </h2>
                <p className="text-zinc-400 text-sm sm:text-base">Slide {currentSlide + 1} of {totalSlides}</p>
              </div>

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
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors backdrop-blur-sm"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleSlideChange(currentSlide + 1)}
              disabled={currentSlide === totalSlides - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors backdrop-blur-sm"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* RIGHT: Next slide preview + Speaker notes */}
        <div className="w-48 sm:w-64 lg:w-72 flex flex-col border-l border-zinc-800 bg-zinc-900/50 flex-shrink-0">
          {/* Next slide preview */}
          <div className="p-2 sm:p-3 border-b border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] sm:text-xs text-zinc-500 font-medium">NEXT</span>
              {currentSlide < totalSlides - 1 && (
                <span className="text-[9px] text-zinc-600">Slide {currentSlide + 2}</span>
              )}
            </div>
            <div className={`aspect-video rounded-lg border border-zinc-700 bg-gradient-to-br ${DEMO_SLIDES[currentSlide + 1]?.color || 'from-zinc-800 to-zinc-900'} flex items-center justify-center overflow-hidden`}>
              {currentSlide < totalSlides - 1 ? (
                <span className="text-[10px] sm:text-xs text-zinc-300 text-center px-2 font-medium">
                  {DEMO_SLIDES[currentSlide + 1]?.title}
                </span>
              ) : (
                <span className="text-[10px] text-zinc-600">End of deck</span>
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
                {DEMO_SLIDES[currentSlide]?.notes || 'No notes for this slide.'}
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
      </div>

      {/* ═══ BOTTOM TOOLBAR ═══ */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 bg-zinc-900 border-t border-zinc-800 flex-shrink-0 gap-2">
        {/* Slide navigation */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
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
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
            onClick={() => handleSlideChange(currentSlide + 1)}
            disabled={currentSlide === totalSlides - 1}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Drawing tools */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <ToolButton
            active={activeTool === 'none'}
            onClick={() => setActiveTool('none')}
            icon={<MousePointer2 className="w-3.5 h-3.5" />}
            label="Laser"
            activeColor="text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
          />
          <ToolButton
            active={activeTool === 'pen'}
            onClick={() => setActiveTool('pen')}
            icon={<Pen className="w-3.5 h-3.5" />}
            label="Pen"
            activeColor="text-red-400 bg-red-500/10 border-red-500/30"
          />
          <ToolButton
            active={activeTool === 'highlighter'}
            onClick={() => setActiveTool('highlighter')}
            icon={<Highlighter className="w-3.5 h-3.5" />}
            label="Highlight"
            activeColor="text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
          />
          <ToolButton
            active={activeTool === 'eraser'}
            onClick={() => setActiveTool('eraser')}
            icon={<Eraser className="w-3.5 h-3.5" />}
            label="Erase"
            activeColor="text-zinc-300 bg-zinc-600/30 border-zinc-500/30"
          />
          <ToolButton
            active={activeTool === 'text'}
            onClick={() => setActiveTool('text')}
            icon={<Type className="w-3.5 h-3.5" />}
            label="Text"
            activeColor="text-blue-400 bg-blue-500/10 border-blue-500/30"
          />
          <div className="w-px h-5 bg-zinc-700 mx-0.5" />
          <ToolButton
            active={false}
            onClick={handleClearAnnotations}
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label="Clear"
            activeColor=""
          />
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <ToolButton
            active={audioEnabled}
            onClick={() => {}}
            icon={audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            label="Mic"
            activeColor={audioEnabled ? 'text-emerald-400' : 'text-red-400'}
          />
          <ToolButton
            active={videoEnabled}
            onClick={() => {}}
            icon={videoEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
            label="Cam"
            activeColor={videoEnabled ? 'text-emerald-400' : 'text-red-400'}
          />
          <ToolButton
            active={false}
            onClick={() => {}}
            icon={<Users className="w-3.5 h-3.5" />}
            label="Q&A"
            activeColor=""
          />
        </div>
      </div>

      {/* Pen size slider (shown when pen/highlighter active) */}
      {(activeTool === 'pen' || activeTool === 'highlighter') && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 flex items-center gap-3 z-20 shadow-xl">
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
                    className={`w-5 h-5 rounded-full border-2 ${penColor === c ? 'border-white' : 'border-zinc-600'}`}
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`flex flex-col items-center gap-0.5 px-1.5 sm:px-2 py-1 rounded-lg transition-all border text-xs min-w-[36px] sm:min-w-[40px] ${
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
