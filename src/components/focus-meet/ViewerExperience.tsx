'use client';

import { useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import { useRoomStore } from '@/store/room-store';
import {
  Wifi, WifiOff, Headphones, Monitor, Gauge,
  TrendingDown, TrendingUp, Volume2, VolumeX,
  Maximize2, Minimize2, Radio, ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

type ViewerMode = 'full' | 'slides-audio' | 'audio-only';

interface BandwidthLevel {
  label: string;
  color: string;
  dotClass: string;
  icon: React.ReactNode;
}

interface ModeConfig {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  dataPerHourMB: number;
  minKbps: number;
}

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const MODE_CONFIG: Record<ViewerMode, ModeConfig> = {
  'full': {
    label: 'Full Experience',
    shortLabel: 'Full',
    description: 'Video + Audio + Slides',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    icon: <Monitor className="w-3.5 h-3.5" />,
    dataPerHourMB: 1125,
    minKbps: 1500,
  },
  'slides-audio': {
    label: 'Slides + Audio',
    shortLabel: 'Slides',
    description: 'Slides + Audio (no video)',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
    icon: <Gauge className="w-3.5 h-3.5" />,
    dataPerHourMB: 135,
    minKbps: 300,
  },
  'audio-only': {
    label: 'Audio Only',
    shortLabel: 'Audio',
    description: 'Audio only (minimum data)',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: <Headphones className="w-3.5 h-3.5" />,
    dataPerHourMB: 58,
    minKbps: 0,
  },
};

const BANDWIDTH_LEVELS: Record<'good' | 'ok' | 'poor', BandwidthLevel> = {
  good: { label: 'Good', color: 'text-emerald-400', dotClass: 'bg-emerald-400', icon: <TrendingUp className="w-3 h-3" /> },
  ok:   { label: 'OK',   color: 'text-violet-400',  dotClass: 'bg-violet-400',  icon: <Wifi className="w-3 h-3" /> },
  poor: { label: 'Poor', color: 'text-amber-400',   dotClass: 'bg-amber-400',   icon: <TrendingDown className="w-3 h-3" /> },
};

// Demo slide data
interface SlideData {
  id: number;
  title: string;
  subtitle: string;
  color: string;
}

const DEMO_SLIDES: SlideData[] = [
  { id: 0, title: 'Welcome to Focus Meet', subtitle: 'Adaptive live session platform', color: 'from-emerald-900 to-zinc-900' },
  { id: 1, title: 'The Problem', subtitle: 'Why traditional sessions fail', color: 'from-amber-900 to-zinc-900' },
  { id: 2, title: 'Adaptive Delivery', subtitle: 'Content follows your bandwidth', color: 'from-violet-900 to-zinc-900' },
  { id: 3, title: 'Slide Sync Engine', subtitle: 'Stay in sync, always', color: 'from-cyan-900 to-zinc-900' },
  { id: 4, title: 'Bandwidth Savings', subtitle: 'Up to 90% data reduction', color: 'from-rose-900 to-zinc-900' },
  { id: 5, title: 'Live Demo', subtitle: 'See it in action', color: 'from-teal-900 to-zinc-900' },
  { id: 6, title: 'Q&A', subtitle: 'Ask us anything', color: 'from-orange-900 to-zinc-900' },
];

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function streamQualityToMode(quality: string): ViewerMode {
  if (quality === 'high' || quality === 'auto') return 'full';
  if (quality === 'medium' || quality === 'low') return 'slides-audio';
  return 'audio-only';
}

function getBandwidthLevel(kbps: number): 'good' | 'ok' | 'poor' {
  if (kbps >= 1500) return 'good';
  if (kbps >= 300) return 'ok';
  return 'poor';
}

function formatDataUsage(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB/hr`;
  return `${Math.round(mb)} MB/hr`;
}

// ────────────────────────────────────────────
// Component
// ────────────────────────────────────────────

export function ViewerExperience() {
  const {
    incomingStream, streamQuality, networkHealth,
    localStream, screenShare, audioEnabled,
  } = useRoomStore();

  // ── Derived network metrics ──
  const bandwidthKbps = useMemo(() => {
    if (networkHealth?.totalBandwidthKbps) return networkHealth.totalBandwidthKbps;
    // Fallback: navigator.connection
    if (typeof navigator !== 'undefined') {
      const nav = navigator as any;
      const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      if (conn?.downlink) return conn.downlink * 1000;
    }
    return 1200; // sensible default
  }, [networkHealth]);

  const rttMs = useMemo(() => networkHealth?.avgRTT ?? 150, [networkHealth]);
  const packetLoss = useMemo(() => networkHealth?.avgPacketLoss ?? 0.03, [networkHealth]);
  const isPresenting = screenShare.isSharing;

  // ── Mode state ──
  const [activeMode, setActiveMode] = useState<ViewerMode>('full');
  const [manualOverride, setManualOverride] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);

  // ── Audio waveform ──
  const [waveHeights, setWaveHeights] = useState<number[]>(Array(28).fill(0));
  const animRef = useRef<number | null>(null);

  // ── Transition tracking ──
  const prevModeRef = useRef<ViewerMode>('full');
  const modeTransitionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Determine suggested mode from store ──
  const suggestedMode = useMemo(() => streamQualityToMode(streamQuality), [streamQuality]);

  // ── Auto-switch mode (unless manual override) ──
  useEffect(() => {
    if (manualOverride) return;
    startTransition(() => { setActiveMode(suggestedMode); });
  }, [suggestedMode, manualOverride]);

  // ── Toast on mode change ──
  useEffect(() => {
    if (prevModeRef.current !== activeMode) {
      const prev = prevModeRef.current;
      prevModeRef.current = activeMode;

      const isUpgrade =
        (activeMode === 'full' && prev !== 'full') ||
        (activeMode === 'slides-audio' && prev === 'audio-only');

      if (isUpgrade) {
        toast.success(`Upgraded to ${MODE_CONFIG[activeMode].label}`, {
          description: MODE_CONFIG[activeMode].description,
          duration: 3000,
        });
      } else if (activeMode !== prev) {
        toast.info(`Switched to ${MODE_CONFIG[activeMode].label}`, {
          description: 'Adapting to your connection',
          duration: 3000,
        });
      }
    }
  }, [activeMode]);

  // ── Auto-suggest mode changes when not manually overridden ──
  useEffect(() => {
    if (manualOverride) {
      // Still show suggestion toasts
      if (suggestedMode !== activeMode) {
        const isUpgrade =
          (suggestedMode === 'full' && activeMode !== 'full') ||
          (suggestedMode === 'slides-audio' && activeMode === 'audio-only');

        if (isUpgrade) {
          toast(`Connection improved — ${MODE_CONFIG[suggestedMode].label} available`, {
            description: 'Click the mode badge to switch',
            duration: 5000,
          });
        } else {
          toast(`Connection slowed — ${MODE_CONFIG[suggestedMode].label} recommended`, {
            description: 'Click the mode badge to switch',
            duration: 5000,
          });
        }
      }
    }
  }, [suggestedMode, manualOverride, activeMode]);

  // ── Slide auto-advance (demo) ──
  useEffect(() => {
    if (!autoFollow) return;
    const interval = setInterval(() => {
      setCurrentSlide(prev => {
        const next = prev + 1;
        return next < DEMO_SLIDES.length ? next : prev;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [autoFollow]);

  // ── Audio waveform animation ──
  useEffect(() => {
    if (activeMode !== 'audio-only' || isMuted) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    const animate = () => {
      setWaveHeights(prev =>
        prev.map(h => {
          const target = Math.random() * 0.7 + 0.15;
          return h + (target - h) * 0.3;
        })
      );
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [activeMode, isMuted]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (modeTransitionTimeout.current) clearTimeout(modeTransitionTimeout.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // ── Handlers ──
  const handleManualModeChange = useCallback((mode: ViewerMode) => {
    setManualOverride(mode !== suggestedMode);
    setActiveMode(mode);
  }, [suggestedMode]);

  const handleResetToAuto = useCallback(() => {
    setManualOverride(false);
    setActiveMode(suggestedMode);
  }, [suggestedMode]);

  const handleSlideNav = useCallback((index: number) => {
    if (index < 0 || index >= DEMO_SLIDES.length) return;
    setAutoFollow(false);
    setCurrentSlide(index);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const el = document.fullscreenElement;
    if (!el) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // ── Computed ──
  const bwLevel = getBandwidthLevel(bandwidthKbps);
  const bwConfig = BANDWIDTH_LEVELS[bwLevel];
  const modeConfig = MODE_CONFIG[activeMode];
  const slide = DEMO_SLIDES[currentSlide];

  // ──────────────────────────────
  // RENDER
  // ──────────────────────────────

  return (
    <div className="h-full w-full bg-zinc-950 flex flex-col overflow-hidden relative">

      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0 gap-2">
        {/* Left: Mode badge (clickable) */}
        <div className="flex items-center gap-2 min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${modeConfig.bgColor} ${modeConfig.color} ${modeConfig.borderColor} hover:opacity-80`}
              >
                {modeConfig.icon}
                <span className="hidden sm:inline">{modeConfig.label}</span>
                <span className="sm:hidden">{modeConfig.shortLabel}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-700">
              {(['full', 'slides-audio', 'audio-only'] as ViewerMode[]).map(mode => {
                const cfg = MODE_CONFIG[mode];
                return (
                  <DropdownMenuItem
                    key={mode}
                    onClick={() => handleManualModeChange(mode)}
                    className={`flex items-center gap-2 ${activeMode === mode ? cfg.color : 'text-zinc-400'}`}
                  >
                    {cfg.icon}
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{cfg.label}</span>
                      <span className="text-[10px] text-zinc-500">{cfg.description} · {formatDataUsage(cfg.dataPerHourMB)}</span>
                    </div>
                    {activeMode === mode && (
                      <span className="ml-auto text-[10px] text-zinc-500">Active</span>
                    )}
                  </DropdownMenuItem>
                );
              })}
              {manualOverride && (
                <DropdownMenuItem
                  onClick={handleResetToAuto}
                  className="text-emerald-400 text-xs border-t border-zinc-800 mt-1 pt-1"
                >
                  <Radio className="w-3 h-3" />
                  Reset to Auto
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {manualOverride && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleResetToAuto}
                    className="text-[10px] text-zinc-500 hover:text-emerald-400 transition-colors underline underline-offset-2"
                  >
                    Auto
                  </button>
                </TooltipTrigger>
                <TooltipContent>Reset to automatic mode</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Center: Bandwidth indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-400 text-[10px] sm:text-xs">
          <span className={`inline-block w-2 h-2 rounded-full ${bwConfig.dotClass} ${bwLevel === 'good' ? 'animate-pulse' : ''}`} />
          <span className={bwConfig.color}>{bwConfig.label}</span>
          <span className="text-zinc-600 hidden sm:inline">|</span>
          <span className="hidden sm:inline">{Math.round(bandwidthKbps)} kbps</span>
          <span className="text-zinc-600 hidden md:inline">|</span>
          <span className="hidden md:inline">{Math.round(rttMs)}ms</span>
        </div>

        {/* Right: Data usage + actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-[10px] sm:text-xs text-zinc-500 cursor-default">
                  <Gauge className="w-3 h-3" />
                  <span className="hidden sm:inline">{formatDataUsage(modeConfig.dataPerHourMB)}</span>
                  <span className="sm:hidden">{formatDataUsage(modeConfig.dataPerHourMB).split(' ')[0]}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Estimated data usage at current quality</p>
                <p className="text-zinc-500 text-xs">Full: 1.1 GB/hr · Slides: 135 MB/hr · Audio: 58 MB/hr</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${isMuted ? 'text-red-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isMuted ? 'Unmute audio' : 'Mute audio'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
                  onClick={handleToggleFullscreen}
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Smooth cross-fade container */}
        <div className="absolute inset-0">
          {/* ──── FULL MODE: Video + Audio + Slides ──── */}
          <div
            className={`absolute inset-0 flex transition-opacity duration-500 ease-in-out ${
              activeMode === 'full' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex-1 flex flex-col">
              <div className="flex-1 relative m-2 sm:m-3 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                {incomingStream ? (
                  <video
                    autoPlay
                    playsInline
                    muted={isMuted}
                    ref={el => { if (el && incomingStream) el.srcObject = incomingStream; }}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative">
                        <Monitor className="w-12 h-12 text-zinc-700" />
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                      </div>
                      <p className="text-zinc-500 text-sm">Waiting for live stream…</p>
                      <p className="text-zinc-600 text-xs">Audio is always live</p>
                    </div>
                  </div>
                )}

                {/* Slide title overlay */}
                {isPresenting && slide && (
                  <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-zinc-900/95 via-zinc-900/60 to-transparent">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-zinc-200 text-sm font-medium truncate">{slide.title}</p>
                        <p className="text-zinc-500 text-xs truncate">{slide.subtitle}</p>
                      </div>
                      <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${MODE_CONFIG['full'].borderColor} ${MODE_CONFIG['full'].color} ${MODE_CONFIG['full'].bgColor}`}>
                        Slide {currentSlide + 1}/{DEMO_SLIDES.length}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ──── SLIDES + AUDIO MODE ──── */}
          <div
            className={`absolute inset-0 flex transition-opacity duration-500 ease-in-out ${
              activeMode === 'slides-audio' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex-1 flex flex-col">
              <div className="flex-1 relative m-2 sm:m-3 rounded-xl border border-zinc-800 overflow-hidden">
                {/* Slide content */}
                <div className={`absolute inset-0 bg-gradient-to-br ${slide?.color || 'from-zinc-800 to-zinc-900'} flex items-center justify-center`}>
                  <div className="text-center px-6 sm:px-16 max-w-2xl">
                    <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight">
                      {slide?.title || `Slide ${currentSlide + 1}`}
                    </h2>
                    <p className="text-zinc-400 text-sm sm:text-base">
                      {slide?.subtitle}
                    </p>
                  </div>
                </div>

                {/* "No video" badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] border-violet-500/30 text-violet-400 bg-violet-500/10 gap-1">
                    <WifiOff className="w-2.5 h-2.5" />
                    Video off — saving data
                  </Badge>
                </div>

                {/* Audio indicator */}
                <div className="absolute top-3 right-3">
                  <Badge variant="outline" className={`text-[9px] gap-1 ${isMuted ? 'border-red-500/30 text-red-400 bg-red-500/10' : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'}`}>
                    {isMuted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                    {isMuted ? 'Muted' : 'Live audio'}
                  </Badge>
                </div>

                {/* Slide nav overlay */}
                <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-zinc-900/95 via-zinc-900/60 to-transparent">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 text-xs">
                      Slide {currentSlide + 1} of {DEMO_SLIDES.length}
                    </span>
                    {autoFollow && (
                      <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10 gap-1">
                        <Radio className="w-2.5 h-2.5" />
                        Live
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ──── AUDIO ONLY MODE ──── */}
          <div
            className={`absolute inset-0 flex transition-opacity duration-500 ease-in-out ${
              activeMode === 'audio-only' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
              {/* Audio waveform */}
              <div className="w-full max-w-md h-24 sm:h-32 flex items-end justify-center gap-[3px]">
                {waveHeights.map((h, i) => (
                  <div
                    key={i}
                    className={`w-1.5 sm:w-2 rounded-full transition-all duration-150 ${
                      isMuted ? 'bg-zinc-700' : 'bg-gradient-to-t from-amber-600 to-amber-400'
                    }`}
                    style={{ height: `${isMuted ? 8 : h * 100}%`, minHeight: 4 }}
                  />
                ))}
              </div>

              {/* Speaker placeholder */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-amber-500/30 flex items-center justify-center">
                  <Headphones className="w-7 h-7 text-amber-400" />
                </div>
                <div className="text-center">
                  <p className="text-zinc-400 text-xs mb-1">Now presenting</p>
                  <h3 className="text-zinc-200 text-lg sm:text-xl font-semibold">
                    {slide?.title || 'Live Session'}
                  </h3>
                  <p className="text-zinc-500 text-xs mt-1">
                    {slide?.subtitle || 'Slide ' + (currentSlide + 1) + ' of ' + DEMO_SLIDES.length}
                  </p>
                </div>
              </div>

              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {DEMO_SLIDES.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === currentSlide ? 'bg-amber-400' : i < currentSlide ? 'bg-zinc-600' : 'bg-zinc-800'
                    }`}
                  />
                ))}
              </div>

              {/* Audio controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-3 rounded-xl transition-colors ${
                    isMuted
                      ? 'text-red-400 bg-red-500/10 border border-red-500/30'
                      : 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
                  }`}
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <span className="text-zinc-500 text-xs">
                  {isMuted ? 'Muted' : 'Live audio'}
                </span>
              </div>

              {/* Bandwidth notice */}
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 max-w-sm">
                <WifiOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-amber-300 text-xs leading-relaxed">
                  Low bandwidth — audio only. Same content, minimal data.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SLIDE THUMBNAILS (Full & Slides+Audio only) ═══ */}
      {activeMode !== 'audio-only' && (
        <div className="px-2 sm:px-3 py-2 bg-zinc-900 border-t border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {autoFollow && (
              <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10 flex-shrink-0 gap-1">
                <Radio className="w-2.5 h-2.5" />
                Live
              </Badge>
            )}
            {!autoFollow && (
              <button
                onClick={() => setAutoFollow(true)}
                className="flex-shrink-0 text-[9px] text-amber-400 hover:text-amber-300 underline underline-offset-2"
              >
                Re-join live
              </button>
            )}
            {DEMO_SLIDES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => handleSlideNav(i)}
                className={`flex-shrink-0 w-14 h-9 sm:w-18 sm:h-11 rounded-md border transition-all overflow-hidden ${
                  i === currentSlide
                    ? 'border-emerald-500 ring-1 ring-emerald-500/50'
                    : 'border-zinc-700 hover:border-zinc-500'
                }`}
              >
                <div className={`w-full h-full bg-gradient-to-br ${s.color} flex items-center justify-center`}>
                  <span className={`text-[6px] sm:text-[7px] font-medium ${i === currentSlide ? 'text-white' : 'text-zinc-400'} text-center leading-tight px-0.5`}>
                    {s.title}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
