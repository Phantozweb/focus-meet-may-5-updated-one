'use client';

import { useEffect, useRef, useState } from 'react';
import { getGPUCapabilities, createVideoProcessor, getGPUPerfMetrics, GPUCapabilities, VideoFrameProcessor, GPUPerfMetrics } from '@/lib/gpu-optimizer';
import { useRoomStore } from '@/store/room-store';
import { FractalMeshEngine } from '@/lib/peer-tree';
import { useWorkers } from '@/hooks/use-workers';
import { VideoGrid } from './VideoGrid';
import { ChatPanel } from './ChatPanel';
import { Controls } from './Controls';
import { ParticipantList } from './ParticipantList';
import { FileSharingPanel } from './FileSharingPanel';
import { TreeVisualizer } from './TreeVisualizer';
import { BenchmarkPanel } from './BenchmarkPanel';
import { SlidePresentation } from './SlidePresentation';
import { PresenterView } from './PresenterView';
import { ViewerExperience } from './ViewerExperience';
import { WaitingRoom } from './WaitingRoom';
import { WaitingScreen } from './WaitingScreen';
import { HostControls } from './HostControls';
import { TreeHealthDashboard } from './TreeHealthDashboard';
import {
  ChatMessage, SpeakerRequest, TreeNode, NodeStatus, StreamHealth,
  NetworkHealthSnapshot, SharedFile, Reaction, ReactionType,
  ScreenShareState, WaitingAttendee, DeviceCapability,
} from '@/lib/types';
import { useTheme } from '@/components/theme-provider';
import { toast } from 'sonner';
import {
  Clock, WifiOff, AlertTriangle, Users, Shield, Copy, Check,
  Sun, Moon, ArrowLeft, Menu, X, ChevronDown, Monitor,
  ChevronRight, UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { isValidRoomId, isValidToken, normalizeRoomId, normalizeToken } from '@/lib/room-system';
import { resumeAudioContext } from '@/lib/audio-context';

const REACTION_EMOJI_MAP: Record<ReactionType, string> = {
  thumbsup: '👍',
  clap: '👏',
  heart: '❤️',
  laugh: '😂',
  fire: '🔥',
  wave: '👋',
};

export function RoomPage() {
  const { theme, toggleTheme } = useTheme();
  const {
    isHost, isInRoom, isChatOpen, isParticipantsOpen, isFilesOpen,
    myNode, connectionStatus, roomInfo, streamQuality,
    nodes, networkHealth, engine, screenShare, reactions,
    setLocalStream, setIncomingStream, setPeerStream, setMyNode, setNodes, setClusters,
    addChatMessage, addSpeakerRequest, setConnectionStatus,
    setEngine, setInRoom, setIsHost, setRoomInfo,
    setAudioEnabled, setVideoEnabled, setStreamHealth, setStreamQuality,
    setMyDevice, addNetworkHistory, reset,
    setScreenShare, addReaction, setDisplayName,
    addSharedFile, updateSharedFile,
    isPresenting, slides, setIsPresenting, setCurrentSlideIndex, setSlides,
    isCoHost, coHosts, setIsCoHost, setCoHosts,
    isWaitingRoomEnabled, waitingForAdmission, setWaitingRoomEnabled, setWaitingForAdmission,
    wasDeniedFromWaitingRoom, setWasDeniedFromWaitingRoom,
    isRoomLocked, setIsRoomLocked,
    slideChangeCallback, annotationCallback, setSlideChangeCallback, setAnnotationCallback,
    waitingRoom, addWaitingAttendee, removeWaitingAttendee,
    addHandRaise, removeHandRaise,
  } = useRoomStore();

  const workers = useWorkers();

  const engineRef = useRef<FractalMeshEngine | null>(null);
  const initRef = useRef(false);
  const coHostsRef = useRef<string[]>([]);
  const waitingRoomRef = useRef<WaitingAttendee[]>([]);
  const [streamDuration, setStreamDuration] = useState(0);
  const durRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [copied, setCopied] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<'chat' | 'participants' | 'files' | 'waiting' | null>(null);
  const [gpuCapabilities] = useState<GPUCapabilities>(() => getGPUCapabilities());
  const [gpuMetrics, setGpuMetrics] = useState<GPUPerfMetrics | null>(null);
  const videoProcessorRef = useRef<VideoFrameProcessor | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; type: ReactionType; x: number }[]>([]);
  const [isWaitingRoomPanelOpen, setIsWaitingRoomPanelOpen] = useState(false);

  // Keep refs in sync with state (must be in useEffect to avoid render-time ref access)
  useEffect(() => {
    coHostsRef.current = coHosts;
    waitingRoomRef.current = waitingRoom;
  });

  // Timer
  useEffect(() => {
    if (isInRoom) {
      const start = Date.now();
      durRef.current = setInterval(() => setStreamDuration(Date.now() - start), 1000);
    }
    return () => { if (durRef.current) clearInterval(durRef.current); };
  }, [isInRoom]);

  // Floating reaction animations
  const prevReactionCountRef = useRef(0);
  const reactionTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (reactions.length === 0 || reactions.length <= prevReactionCountRef.current) {
      prevReactionCountRef.current = reactions.length;
      return;
    }
    prevReactionCountRef.current = reactions.length;
    const latest = reactions[reactions.length - 1];
    const id = `${latest.id}-${Date.now()}`;
    const x = 20 + Math.random() * 60;
    queueMicrotask(() => {
      setFloatingReactions(prev => [...prev, { id, type: latest.type, x }]);
      const timeoutId = setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== id));
      }, 2500);
      reactionTimeoutsRef.current.push(timeoutId);
    });
    return () => {
      reactionTimeoutsRef.current.forEach(clearTimeout);
      reactionTimeoutsRef.current = [];
    };
  }, [reactions]);

  // GPU initialization
  useEffect(() => {
    const processor = createVideoProcessor();
    videoProcessorRef.current = processor;

    // Periodic GPU metrics
    const metricsInterval = setInterval(() => {
      const metrics = getGPUPerfMetrics();
      setGpuMetrics(metrics);
    }, 5000);

    return () => {
      clearInterval(metricsInterval);
      if (videoProcessorRef.current) {
        videoProcessorRef.current.destroy();
      }
    };
  }, []);

  // Engine initialization
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.substring(1));
      const roomIdParam = params.get('room');
      const tokenParam = params.get('token');
      const host = params.get('host') === 'true';
      const name = params.get('name') || 'Anonymous';
      const waitingRoomParam = params.get('waitingRoom') !== 'false'; // default true
      setDisplayName(name);

      if (!roomIdParam) {
        window.location.hash = '';
        return;
      }

      // Validate room ID format
      const normalizedId = normalizeRoomId(roomIdParam);
      if (!isValidRoomId(normalizedId)) {
        toast.error('Invalid Room ID format. Use FM-XXXX format.');
        setTimeout(() => { window.location.hash = ''; }, 2000);
        return;
      }

      // Validate token if provided
      if (tokenParam) {
        const normalizedTk = normalizeToken(tokenParam);
        if (!isValidToken(normalizedTk)) {
          toast.error('Invalid access token.');
          setTimeout(() => { window.location.hash = ''; }, 2000);
          return;
        }
      }

      const eng = new FractalMeshEngine();
      engineRef.current = eng;
      setEngine(eng);
      setMyDevice(eng.getDevice());

      // Core callbacks
      eng.setOnStreamUpdate((stream, fromPeerId) => {
        setIncomingStream(stream);
        setPeerStream(fromPeerId, stream);
      });
      eng.setOnTreeUpdate((nodes) => {
        setNodes(nodes);
        const myId = eng.getMyNode()?.peerId;
        if (myId) { const n = nodes.get(myId); if (n) setMyNode(n); }
      });
      eng.setOnChatMessage((msg: ChatMessage) => addChatMessage(msg));
      eng.setOnSpeakerRequest((req: SpeakerRequest) => {
        addSpeakerRequest(req);
        toast(`${req.displayName} wants to speak`, { description: 'Approve in participants panel', duration: 5000 });
      });
      eng.setOnConnectionStatus((status: NodeStatus) => {
        setConnectionStatus(status);
        if (status === 'reconnecting') toast('Reconnecting...', { duration: 3000 });
        else if (status === 'connected') {
          toast.success('Connected!');
          // Detect waiting room admission: if viewer was waiting and now connected, admit them
          if (!host && useRoomStore.getState().waitingForAdmission) {
            setWaitingForAdmission(false);
            toast.success("You've been admitted to the room!");
          }
        }
        else if (status === 'error') toast.error('Connection failed');
      });
      eng.setOnError((e: string) => {
        toast.error(e);
        if (e.toLowerCase().includes('denied')) {
          setWasDeniedFromWaitingRoom(true);
        }
      });
      eng.setOnStreamHealth((h: StreamHealth) => { setStreamHealth(h); setStreamQuality(h.quality); });
      eng.setOnClusterUpdate((clusters) => setClusters(clusters));
      eng.setOnNetworkHealth((snapshot: NetworkHealthSnapshot) => addNetworkHistory(snapshot));
      eng.setOnFileShared((file: SharedFile) => addSharedFile(file));
      eng.setOnFileChunk((fileId, chunkIndex, totalChunks, _data) => {
        updateSharedFile(fileId, { transferredChunks: chunkIndex + 1, chunks: totalChunks });
      });
      eng.setOnScreenShare((isSharing, sharedBy, sharedByName, stream) => {
        setScreenShare({ isSharing, sharedBy, sharedByName, stream: stream ?? null });
        if (isSharing) toast(`${sharedByName} started screen sharing`);
      });
      eng.setOnReaction((reaction: Reaction) => addReaction(reaction));

      // Slide change callback
      eng.setOnSlideChange((slideIndex: number) => {
        setCurrentSlideIndex(slideIndex);
        if (slideChangeCallback) slideChangeCallback(slideIndex);
      });

      // Annotation callback
      eng.setOnAnnotation((annotation: { type: string; x: number; y: number; data?: any }) => {
        if (annotationCallback) annotationCallback(annotation);
      });

      // Waiting room update callback (host receives waiting list updates)
      eng.setOnWaitingRoomUpdate((attendees: Array<{ peerId: string; displayName: string; device: DeviceCapability | null }>) => {
        const currentWaitingRoom = waitingRoomRef.current;
        // Update the waiting room list
        attendees.forEach(a => {
          if (!currentWaitingRoom.some(w => w.peerId === a.peerId)) {
            addWaitingAttendee({
              peerId: a.peerId,
              displayName: a.displayName,
              joinedAt: Date.now(),
              device: a.device || {
                deviceType: 'unknown',
                screenResolution: { width: 0, height: 0 },
                cpuCores: 0, memoryGB: 0, isMobile: false,
                networkType: 'unknown', downlinkMbps: 0, rttMs: 0, saveData: false,
              },
            });
          }
        });
        // Remove attendees who are no longer in the waiting list (they were admitted/denied)
        currentWaitingRoom.forEach(existing => {
          if (!attendees.some(a => a.peerId === existing.peerId)) {
            removeWaitingAttendee(existing.peerId);
          }
        });
      });

      // Co-host update callback
      eng.setOnCoHostUpdate((info: { peerId: string; isCoHost: boolean }) => {
        const currentCoHosts = coHostsRef.current;
        if (info.isCoHost) {
          setCoHosts([...currentCoHosts.filter(id => id !== info.peerId), info.peerId]);
          if (info.peerId === eng.getMyNode()?.peerId) {
            setIsCoHost(true);
          }
        } else {
          setCoHosts(currentCoHosts.filter(id => id !== info.peerId));
          if (info.peerId === eng.getMyNode()?.peerId) {
            setIsCoHost(false);
          }
        }
      });

      // Hand raise update callback — receive hand raise/lower from P2P network
      eng.setOnHandRaiseUpdate((info: { peerId: string; displayName: string; isRaised: boolean }) => {
        if (info.isRaised) {
          addHandRaise({
            peerId: info.peerId,
            displayName: info.displayName,
            isRaised: true,
            raisedAt: Date.now(),
          });
        } else {
          removeHandRaise(info.peerId);
        }
      });

      try {
        if (host) {
          // HOST FLOW: create room → start camera/mic → enter host view
          const info = await eng.createRoom(name, `Focus Meet - ${normalizedId}`);
          setRoomInfo(info); setIsHost(true);
          // Sync waiting room setting from URL param to engine
          eng.setWaitingRoomEnabled(waitingRoomParam);
          setWaitingRoomEnabled(waitingRoomParam);
          const stream = await eng.startLocalStream(true, true);
          setLocalStream(stream); setAudioEnabled(true); setVideoEnabled(true);
          addChatMessage({ id: 'sys-1', senderId: 'system', senderName: 'System',
            content: `Room "${normalizedId}" created! Share the Room ID and Token with participants.`, timestamp: Date.now(), type: 'system' });
        } else {
          // VIEWER FLOW: join room → waiting room (if needed) → viewer experience
          const info = await eng.joinRoom(normalizedId, name);
          setRoomInfo(info); setIsHost(false);

          // Check if we're in the waiting room (engine sets this from isWaiting flag in room-info)
          if (eng.isInWaitingRoom()) {
            setWaitingForAdmission(true);
            addChatMessage({
              id: 'sys-waiting', senderId: 'system', senderName: 'System',
              content: 'You are in the waiting room. The host will admit you shortly.',
              timestamp: Date.now(), type: 'system',
            });
          } else {
            addChatMessage({
              id: 'sys-1', senderId: 'system', senderName: 'System',
              content: `Connected to room ${normalizedId}!`,
              timestamp: Date.now(), type: 'system',
            });
          }
        }
        setInRoom(true);
      } catch (err: any) {
        toast.error('Connection failed', { description: err.message || 'Try again' });
        setTimeout(() => { window.location.hash = ''; }, 2000);
      }
    };
    init();
    return () => { if (engineRef.current) { engineRef.current.destroy(); engineRef.current = null; } };
  }, []);

  // Hash change handler
  useEffect(() => {
    const h = () => { if (!window.location.hash) reset(); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, [reset]);

  // Wire workers into engine
  useEffect(() => {
    if (engine && workers.workerProxy) {
      engine.setWorkerProxy(workers.workerProxy);
    }
  }, [engine, workers.workerProxy]);

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    return `${h.toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const copyInviteUrl = () => {
    const hash = window.location.hash;
    const url = `${window.location.origin}${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success('Invite link copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Clean quality label - NO architecture terms
  const qualityLabel = streamQuality === 'high' || streamQuality === 'auto' ? 'HD'
    : streamQuality === 'medium' ? 'SD'
    : streamQuality === 'low' ? 'Low'
    : 'Audio';

  const qualityColor = streamQuality === 'high' || streamQuality === 'auto' ? 'text-blue-400'
    : streamQuality === 'medium' ? 'text-amber-400'
    : streamQuality === 'low' ? 'text-orange-400' : 'text-red-400';

  // ═══════════════════════════════════════════════════════
  // RENDER: Connecting... screen
  // ═══════════════════════════════════════════════════════
  if (!isInRoom) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Connecting...</p>
          <p className="text-zinc-600 text-xs">Setting up your connection</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER: Waiting screen (viewer waiting for admission)
  // ═══════════════════════════════════════════════════════
  if (waitingForAdmission) {
    return <WaitingScreen />;
  }

  // ═══════════════════════════════════════════════════════
  // RENDER: HOST LAYOUT
  // ═══════════════════════════════════════════════════════
  if (isHost) {
    return (
      <div onClick={() => resumeAudioContext()} className="h-screen w-screen bg-zinc-950 flex flex-col overflow-hidden relative">
        {/* Status banners */}
        {connectionStatus === 'reconnecting' && (
          <div className="bg-amber-600 text-white text-center py-1.5 text-xs font-medium flex items-center justify-center gap-2 animate-pulse z-50">
            <WifiOff className="w-3 h-3" /> Reconnecting...
          </div>
        )}
        {connectionStatus === 'error' && (
          <div className="bg-red-600 text-white text-center py-1.5 text-xs font-medium flex items-center justify-center gap-2 z-50">
            <AlertTriangle className="w-3 h-3" /> Connection lost
          </div>
        )}

        {/* Top bar - Host status */}
        <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-zinc-900 border-b border-zinc-800 z-10 flex-shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <button
              onClick={() => { reset(); window.location.hash = ''; }}
              className="sm:hidden p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-zinc-400" />
            </button>

            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                connectionStatus === 'connected' ? 'bg-blue-500' :
                connectionStatus === 'reconnecting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-zinc-300 text-xs sm:text-sm font-medium truncate max-w-[100px] sm:max-w-none">
                {roomInfo?.title || 'Focus Meet'}
              </span>
            </div>
            <span className="text-zinc-700 text-xs hidden sm:inline">|</span>

            {/* Host badge */}
            <Badge className="h-5 px-1.5 text-[9px] bg-blue-500/20 text-blue-400 border-0 hidden sm:inline-flex">
              <Shield className="w-2.5 h-2.5 mr-0.5" />
              Host
            </Badge>

            <div className="hidden sm:flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span className="text-zinc-400 text-xs font-mono">{fmt(streamDuration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Waiting room toggle */}
            {waitingRoom.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-1.5 text-[9px] sm:text-[10px] gap-0.5 ${
                  isWaitingRoomPanelOpen ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                onClick={() => setIsWaitingRoomPanelOpen(!isWaitingRoomPanelOpen)}
              >
                <Users className="w-3 h-3" />
                <span className="hidden sm:inline">Waiting</span>
                <Badge className="h-4 px-1 text-[8px] bg-amber-500/20 text-amber-400 border-0 ml-0.5">
                  {waitingRoom.length}
                </Badge>
              </Button>
            )}

            {/* User count */}
            <div className="flex items-center gap-1 text-zinc-400 text-[10px] sm:text-xs">
              <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>{nodes.size}</span>
            </div>

            <span className="text-zinc-700 text-xs">|</span>

            {/* Quality */}
            <div className="flex items-center gap-0.5">
              <span className={`text-[10px] sm:text-xs font-bold ${qualityColor}`}>{qualityLabel}</span>
            </div>

            {/* GPU status */}
            {gpuCapabilities && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-zinc-600">
                  {gpuCapabilities.videoProcessingMode === 'webgpu' ? 'GPU' :
                   gpuCapabilities.videoProcessingMode === 'webgl2' ? 'GL2' :
                   gpuCapabilities.videoProcessingMode === 'webgl1' ? 'GL1' : 'CPU'}
                </span>
                {gpuCapabilities.wasmSimd && (
                  <span className="text-[8px] text-emerald-600">SIMD</span>
                )}
              </div>
            )}

            <span className="text-zinc-700 text-xs hidden sm:inline">|</span>

            {/* Host Controls dropdown */}
            <HostControls />

            {/* Copy invite */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[9px] sm:text-[10px] text-zinc-400 hover:text-zinc-200 gap-0.5"
              onClick={copyInviteUrl}
            >
              {copied ? <Check className="w-3 h-3 text-blue-400" /> : <Copy className="w-3 h-3" />}
              <span className="hidden sm:inline">Invite</span>
            </Button>

            {/* Theme toggle */}
            <button onClick={toggleTheme} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
              {theme === 'dark' ? <Sun className="w-3 h-3 text-zinc-400" /> : <Moon className="w-3 h-3 text-zinc-600" />}
            </button>

            {/* Mobile drawer toggle */}
            <button
              onClick={() => setMobileDrawer(mobileDrawer ? null : 'chat')}
              className="sm:hidden p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <Menu className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Tree Health Status Bar */}
        <div className="flex items-center gap-3 px-3 py-1.5 bg-emerald-950/30 border-b border-emerald-800/30 text-xs overflow-x-auto">
          <span className="text-emerald-400 whitespace-nowrap">🌳 Roots: {roomInfo?.rootNodes?.length || 0}</span>
          <span className="text-emerald-400 whitespace-nowrap">👥 Viewers: {nodes.size - 1}</span>
          <span className="text-emerald-400 whitespace-nowrap">📐 Depth: {nodes.size > 0 ? Math.max(...Array.from(nodes.values()).map(n => n.depth)) : 0}</span>
          <span className="text-emerald-400 whitespace-nowrap">📡 Upload: {engine?.getHostBandwidthInfo()?.uploadKbps || 0} kbps</span>
          {engine?.getHostBandwidthInfo()?.isLowBandwidth && (
            <span className="text-amber-400 whitespace-nowrap">⚡ Low BW</span>
          )}
        </div>

        {/* Screen share indicator */}
        {screenShare.isSharing && (
          <div className="flex items-center justify-center gap-2 px-4 py-1 bg-blue-600/20 border-b border-blue-500/30 text-blue-300 text-xs">
            <Monitor className="w-3.5 h-3.5" />
            <span className="font-medium">{screenShare.sharedByName} is sharing screen</span>
          </div>
        )}

        {/* Host main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: PresenterView or VideoGrid/SlidePresentation */}
          <div className="flex-1 flex flex-col min-w-0">
            {isPresenting && slides.length > 0 ? (
              <div className="flex-1 min-h-0">
                <SlidePresentation isSpeaker={isHost} />
              </div>
            ) : (
              <VideoGrid />
            )}
          </div>

          {/* Right side panel: TreeHealth + WaitingRoom + Chat + Participants + Files */}
          <div className="hidden sm:flex flex-col w-80 border-l border-zinc-800 bg-zinc-900/50 flex-shrink-0 overflow-y-auto custom-scrollbar">
            {/* Tree Health Dashboard — always visible for hosts */}
            <div className="border-b border-zinc-800">
              <TreeHealthDashboard />
            </div>
            {/* Waiting Room Panel (collapsible) */}
            {isWaitingRoomPanelOpen && (
              <div className="border-b border-zinc-800 max-h-64 overflow-y-auto">
                <WaitingRoom />
              </div>
            )}
            {/* Other panels */}
            {isParticipantsOpen && <ParticipantList />}
            {isChatOpen && <ChatPanel />}
            {isFilesOpen && <FileSharingPanel />}
          </div>
        </div>

        {/* Mobile drawer (bottom sheet) */}
        <AnimatePresence>
          {mobileDrawer && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black z-30 sm:hidden"
                onClick={() => setMobileDrawer(null)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-zinc-900 border-t border-zinc-700 rounded-t-2xl max-h-[70vh] overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-zinc-200 capitalize">{mobileDrawer}</span>
                  <button onClick={() => setMobileDrawer(null)} className="p-1 rounded-lg hover:bg-zinc-800">
                    <X className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>
                <div className="overflow-auto max-h-[60vh]">
                  {mobileDrawer === 'chat' && <ChatPanel />}
                  {mobileDrawer === 'participants' && <ParticipantList />}
                  {mobileDrawer === 'files' && <FileSharingPanel />}
                  {mobileDrawer === 'waiting' && <WaitingRoom />}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Controls */}
        <Controls
          onMobileDrawerOpen={(type) => setMobileDrawer(type as 'chat' | 'participants' | 'files' | 'waiting' | null)}
          mobileDrawerOpen={!!mobileDrawer}
        />

        {/* Overlays - host-only */}
        <TreeVisualizer />
        <BenchmarkPanel />

        {/* Floating reactions */}
        <div className="absolute bottom-20 left-0 right-0 pointer-events-none z-20 overflow-hidden">
          <AnimatePresence>
            {floatingReactions.map(r => (
              <motion.div
                key={r.id}
                initial={{ opacity: 1, y: 0, scale: 1 }}
                animate={{ opacity: 0, y: -200, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.5, ease: 'easeOut' }}
                className="absolute text-2xl sm:text-3xl"
                style={{ left: `${r.x}%` }}
              >
                {REACTION_EMOJI_MAP[r.type]}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // RENDER: VIEWER LAYOUT
  // ═══════════════════════════════════════════════════════
  return (
    <div onClick={() => resumeAudioContext()} className="h-screen w-screen bg-zinc-950 flex flex-col overflow-hidden relative">
      {/* Status banners */}
      {connectionStatus === 'reconnecting' && (
        <div className="bg-amber-600 text-white text-center py-1.5 text-xs font-medium flex items-center justify-center gap-2 animate-pulse z-50">
          <WifiOff className="w-3 h-3" /> Reconnecting...
        </div>
      )}
      {connectionStatus === 'error' && (
        <div className="bg-red-600 text-white text-center py-1.5 text-xs font-medium flex items-center justify-center gap-2 z-50">
          <AlertTriangle className="w-3 h-3" /> Connection lost
        </div>
      )}

      {/* Top bar - Viewer status */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-zinc-900 border-b border-zinc-800 z-10 flex-shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button
            onClick={() => { reset(); window.location.hash = ''; }}
            className="sm:hidden p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-zinc-400" />
          </button>

          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              connectionStatus === 'connected' ? 'bg-blue-500' :
              connectionStatus === 'reconnecting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-zinc-300 text-xs sm:text-sm font-medium truncate max-w-[100px] sm:max-w-none">
              {roomInfo?.title || 'Focus Meet'}
            </span>
          </div>
          <span className="text-zinc-700 text-xs hidden sm:inline">|</span>
          <div className="hidden sm:flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-500" />
            <span className="text-zinc-400 text-xs font-mono">{fmt(streamDuration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* User count */}
          <div className="flex items-center gap-1 text-zinc-400 text-[10px] sm:text-xs">
            <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>{nodes.size}</span>
          </div>

          <span className="text-zinc-700 text-xs">|</span>

          {/* Quality */}
          <div className="flex items-center gap-0.5">
            <span className={`text-[10px] sm:text-xs font-bold ${qualityColor}`}>{qualityLabel}</span>
          </div>

          {/* GPU status */}
          {gpuCapabilities && (
            <div className="flex items-center gap-0.5">
              <span className="text-[9px] text-zinc-600">
                {gpuCapabilities.videoProcessingMode === 'webgpu' ? 'GPU' :
                 gpuCapabilities.videoProcessingMode === 'webgl2' ? 'GL2' :
                 gpuCapabilities.videoProcessingMode === 'webgl1' ? 'GL1' : 'CPU'}
              </span>
              {gpuCapabilities.wasmSimd && (
                <span className="text-[8px] text-emerald-600">SIMD</span>
              )}
            </div>
          )}

          <span className="text-zinc-700 text-xs hidden sm:inline">|</span>

          {/* Copy invite */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[9px] sm:text-[10px] text-zinc-400 hover:text-zinc-200 gap-0.5"
            onClick={copyInviteUrl}
          >
            {copied ? <Check className="w-3 h-3 text-blue-400" /> : <Copy className="w-3 h-3" />}
            <span className="hidden sm:inline">Invite</span>
          </Button>

          {/* Theme toggle */}
          <button onClick={toggleTheme} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
            {theme === 'dark' ? <Sun className="w-3 h-3 text-zinc-400" /> : <Moon className="w-3 h-3 text-zinc-600" />}
          </button>

          {/* Mobile drawer toggle */}
          <button
            onClick={() => setMobileDrawer(mobileDrawer ? null : 'chat')}
            className="sm:hidden p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <Menu className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Screen share indicator */}
      {screenShare.isSharing && (
        <div className="flex items-center justify-center gap-2 px-4 py-1 bg-blue-600/20 border-b border-blue-500/30 text-blue-300 text-xs">
          <Monitor className="w-3.5 h-3.5" />
          <span className="font-medium">{screenShare.sharedByName} is sharing screen</span>
        </div>
      )}

      {/* Viewer main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main: ViewerExperience */}
        <div className="flex-1 flex flex-col min-w-0">
          <ViewerExperience />
        </div>

        {/* Side panels */}
        <div className="hidden sm:flex">
          {isParticipantsOpen && <ParticipantList />}
          {isChatOpen && <ChatPanel />}
          {isFilesOpen && <FileSharingPanel />}
        </div>
      </div>

      {/* Mobile drawer (bottom sheet) */}
      <AnimatePresence>
        {mobileDrawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-30 sm:hidden"
              onClick={() => setMobileDrawer(null)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-zinc-900 border-t border-zinc-700 rounded-t-2xl max-h-[70vh] overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-sm font-semibold text-zinc-200 capitalize">{mobileDrawer}</span>
                <button onClick={() => setMobileDrawer(null)} className="p-1 rounded-lg hover:bg-zinc-800">
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              <div className="overflow-auto max-h-[60vh]">
                {mobileDrawer === 'chat' && <ChatPanel />}
                {mobileDrawer === 'participants' && <ParticipantList />}
                {mobileDrawer === 'files' && <FileSharingPanel />}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Controls */}
      <Controls
        onMobileDrawerOpen={(type) => setMobileDrawer(type as 'chat' | 'participants' | 'files' | 'waiting' | null)}
        mobileDrawerOpen={!!mobileDrawer}
      />

      {/* Overlays */}
      <BenchmarkPanel />

      {/* Floating reactions */}
      <div className="absolute bottom-20 left-0 right-0 pointer-events-none z-20 overflow-hidden">
        <AnimatePresence>
          {floatingReactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 1, y: 0, scale: 1 }}
              animate={{ opacity: 0, y: -200, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.5, ease: 'easeOut' }}
              className="absolute text-2xl sm:text-3xl"
              style={{ left: `${r.x}%` }}
            >
              {REACTION_EMOJI_MAP[r.type]}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
