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
import { SlidePresentation } from './SlidePresentation';
import { PresenterView } from './PresenterView';
import { ViewerExperience } from './ViewerExperience';
import { WaitingRoom } from './WaitingRoom';
import { WaitingScreen } from './WaitingScreen';
import { HostControls } from './HostControls';
import { TreeHealthDashboard } from './TreeHealthDashboard';
import { FakeUsersPanel } from './FakeUsersPanel';
import { ImpersonatePanel } from './ImpersonatePanel';
import { SlideUpload } from './SlideUpload';
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
  ChevronRight, UserCheck, MessageCircle, Bot, Eye, Presentation, Sliders, Link2,
  Hand,
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
    handRaises, addHandRaise, removeHandRaise,
    fakeUsers, hostAdminTab, setHostAdminTab,
    impersonation, viewerInviteLink, setViewerInviteLink,
  } = useRoomStore();

  const workers = useWorkers();

  const engineRef = useRef<FractalMeshEngine | null>(null);
  const initRef = useRef(false);
  const coHostsRef = useRef<string[]>([]);
  const waitingRoomRef = useRef<WaitingAttendee[]>([]);
  const prevStatusRef = useRef<NodeStatus | null>(null);
  const shownHandRaisesRef = useRef<Set<string>>(new Set());
  const lastToastTimeRef = useRef<Record<string, number>>({});

  // Debounced toast helper — only shows toast if enough time has passed since the last identical toast
  const debouncedToast = (key: string, toastFn: () => void, cooldownMs = 5000) => {
    const now = Date.now();
    const lastTime = lastToastTimeRef.current[key] || 0;
    if (now - lastTime >= cooldownMs) {
      lastToastTimeRef.current[key] = now;
      toastFn();
    }
  };
  const [streamDuration, setStreamDuration] = useState(0);
  const durRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [copied, setCopied] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<'chat' | 'participants' | 'files' | 'waiting' | 'slides' | 'fakeusers' | 'impersonate' | 'health' | null>(null);
  const [gpuCapabilities] = useState<GPUCapabilities>(() => getGPUCapabilities());
  const [gpuMetrics, setGpuMetrics] = useState<GPUPerfMetrics | null>(null);
  const videoProcessorRef = useRef<VideoFrameProcessor | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStep, setConnectionStep] = useState<string>('Initializing...');
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; type: ReactionType; x: number }[]>([]);
  const [adminPanelOpen, setAdminPanelOpen] = useState(true);
  const [viewerShowGrid, setViewerShowGrid] = useState(false);
  // hostAdminTab is now managed by the store (hostAdminTab)


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
      const roleParam = params.get('role') || 'viewer'; // host, speaker, moderator, viewer
      const waitingRoomParam = params.get('waitingRoom') !== 'false'; // default true
      const hostPeerIdParam = params.get('hostPeer'); // actual host peer ID from URL
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
        // Only show toasts on status TRANSITIONS, not repeated statuses
        const prevStatus = prevStatusRef.current;
        prevStatusRef.current = status;
        if (status === prevStatus) return; // Skip duplicate status
        if (status === 'reconnecting') {
          debouncedToast('reconnecting', () => toast('Reconnecting...', { duration: 3000 }));
        }
        else if (status === 'connected') {
          // Only show the "admitted" toast for viewers who were in the waiting room;
          // skip the generic "Connected!" toast since the UI already shows connection status
          if (!host && useRoomStore.getState().waitingForAdmission) {
            setWaitingForAdmission(false);
            toast.success("You've been admitted to the room!");
          }
        }
        else if (status === 'error') {
          debouncedToast('connection-error', () => toast.error('Connection failed'));
        }
      });
      eng.setOnError((e: string) => {
        toast.error(e);
        if (e.toLowerCase().includes('denied')) {
          setWasDeniedFromWaitingRoom(true);
        }
      });
      eng.setOnStreamHealth((h: StreamHealth) => { setStreamHealth(h); setStreamQuality(h.quality); });
      eng.setOnClusterUpdate((clusters) => setClusters(clusters));
      eng.setOnNetworkHealth((_snapshot: NetworkHealthSnapshot) => { addNetworkHistory(_snapshot); });
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
          // Only show toast for NEW hand raises, not repeated updates
          if (!shownHandRaisesRef.current.has(info.peerId)) {
            shownHandRaisesRef.current.add(info.peerId);
            toast(`${info.displayName} raised their hand`, { duration: 3000 });
          }
        } else {
          removeHandRaise(info.peerId);
          shownHandRaisesRef.current.delete(info.peerId);
        }
      });

      try {
        if (host) {
          // HOST FLOW: create room → start camera/mic → enter host view
          // Pass the roomId from URL so host and viewer peer IDs match
          setConnectionStep('Connecting to signaling server...');
          const info = await eng.createRoom(name, `Focus Meet - ${normalizedId}`, normalizedId);
          setRoomInfo(info); setIsHost(true);

          // Update URL hash with the actual host peer ID so viewers can connect
          // This is critical because the host peer ID now includes a session token
          const actualHostPeerId = info.hostPeerId;
          if (actualHostPeerId) {
            const currentHash = window.location.hash.substring(1);
            const currentParams = new URLSearchParams(currentHash);
            currentParams.set('hostPeer', actualHostPeerId);
            window.history.replaceState(null, '', '#' + currentParams.toString());
          }

          setConnectionStep('Starting camera & microphone...');
          // Sync waiting room setting from URL param to engine
          eng.setWaitingRoomEnabled(waitingRoomParam);
          setWaitingRoomEnabled(waitingRoomParam);
          const stream = await eng.startLocalStream(true, true);
          setLocalStream(stream); setAudioEnabled(true); setVideoEnabled(true);
          addChatMessage({ id: 'sys-1', senderId: 'system', senderName: 'System',
            content: `Room "${normalizedId}" created! Share the Room ID and Token with participants.`, timestamp: Date.now(), type: 'system' });
        } else {
          // VIEWER FLOW: join room → waiting room (if needed) → viewer experience
          setConnectionStep('Connecting to signaling server...');
          const info = await eng.joinRoom(normalizedId, name, hostPeerIdParam || undefined, roleParam);
          setRoomInfo(info); setIsHost(false);
          // Viewers should NOT have audio/video enabled by default — listen-only mode
          setAudioEnabled(false);
          setVideoEnabled(false);

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
        const errorMsg = err?.message || 'Unknown error';
        setConnectionError(errorMsg);
        toast.error('Connection failed', { description: errorMsg });
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
    // Generate a viewer-specific invite link (not the host URL)
    const roomId = roomInfo?.roomId || '';
    const hostPeer = roomInfo?.hostPeerId || '';
    const viewerLink = `${window.location.origin}${window.location.pathname}#join=true&room=${roomId}&hostPeer=${hostPeer}`;
    setViewerInviteLink(viewerLink);
    navigator.clipboard.writeText(viewerLink).then(() => {
      setCopied(true);
      toast.success('Viewer invite link copied!', { description: 'Share this link for viewers to join' });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyHostLink = () => {
    const hash = window.location.hash;
    const url = `${window.location.origin}${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Host link copied!', { description: 'Only share with co-hosts' });
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
    // Error state — show error with retry
    if (connectionError) {
      return (
        <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-5 max-w-sm text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-600/15 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Connection Failed</h2>
              <p className="text-sm text-zinc-400">{connectionError}</p>
            </div>
            <div className="bg-zinc-900/80 border border-white/10 rounded-xl p-4 w-full text-left space-y-2">
              <p className="text-xs font-semibold text-zinc-300">Troubleshooting:</p>
              <ul className="text-[11px] text-zinc-500 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>Make sure the <strong className="text-zinc-300">host has started the room</strong> before viewers try to join</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>Check your internet connection is stable</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>Try joining again — temporary network issues can cause this</span>
                </li>
              </ul>
            </div>
            <div className="flex gap-3 w-full">
              <Button
                onClick={() => { setConnectionError(null); setConnectionStep('Retrying...'); initRef.current = false; window.location.reload(); }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11"
              >
                Retry
              </Button>
              <Button
                onClick={() => { window.location.hash = ''; }}
                variant="outline"
                className="flex-1 border-white/15 text-zinc-300 hover:bg-white/5 h-11"
              >
                Go Back
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Connecting state — show progress
    return (
      <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-300 text-sm font-medium">{connectionStep}</p>
          <p className="text-zinc-600 text-xs">This may take a moment</p>
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
            {/* Waiting room indicator — clicking switches to Waiting tab */}
            {waitingRoom.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[9px] sm:text-[10px] gap-0.5 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                onClick={() => setHostAdminTab('waiting')}
              >
                <Users className="w-3 h-3" />
                <span className="hidden sm:inline">Waiting</span>
                <Badge className="h-4 px-1 text-[8px] bg-amber-500/20 text-amber-400 border-0 ml-0.5 animate-pulse">
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

            {/* Admin panel toggle (desktop only) */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[9px] sm:text-[10px] text-zinc-400 hover:text-zinc-200 gap-0.5"
              onClick={() => setAdminPanelOpen(!adminPanelOpen)}
              title={adminPanelOpen ? 'Close panel' : 'Open panel'}
            >
              {adminPanelOpen ? <X className="w-3 h-3" /> : <Sliders className="w-3 h-3" />}
              <span className="hidden sm:inline">{adminPanelOpen ? 'Close' : 'Panel'}</span>
            </Button>

            {/* Copy invite */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[9px] sm:text-[10px] text-zinc-400 hover:text-zinc-200 gap-0.5"
              onClick={copyInviteUrl}
              title="Copy viewer invite link"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Link2 className="w-3 h-3" />}
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

        {/* Hand raise notification bar */}
        {handRaises.filter(h => h.isRaised).length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0 overflow-x-auto scrollbar-none">
            <Hand className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-amber-300 text-xs font-medium flex-shrink-0">Raised hands:</span>
            {handRaises.filter(h => h.isRaised).map(h => (
              <div key={h.peerId} className="flex items-center gap-1.5 bg-amber-500/15 rounded-full px-2 py-0.5 flex-shrink-0">
                <span className="text-amber-200 text-[10px] font-medium">{h.displayName}</span>
                <button
                  onClick={() => {
                    engine?.approveSpeaker(h.peerId);
                    removeHandRaise(h.peerId);
                    toast.success(`Approved ${h.displayName} to speak`);
                  }}
                  className="text-[9px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 px-1.5 py-0.5 rounded-full transition-colors"
                >
                  Approve
                </button>
              </div>
            ))}
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

          {/* Right side panel: Admin panel with tabs (toggleable) */}
          {adminPanelOpen && (
          <div className="hidden sm:flex flex-col w-80 border-l border-zinc-800 bg-zinc-900/50 flex-shrink-0 overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-zinc-800 flex-shrink-0 overflow-x-auto scrollbar-none">
              <HostTabButton
                label="Waiting"
                icon={<Users className="w-3.5 h-3.5" />}
                active={hostAdminTab === 'waiting'}
                badge={waitingRoom.length > 0 ? waitingRoom.length : undefined}
                badgeClass="bg-amber-500/20 text-amber-400"
                onClick={() => setHostAdminTab('waiting')}
              />
              <HostTabButton
                label="People"
                icon={<Users className="w-3.5 h-3.5" />}
                active={hostAdminTab === 'participants'}
                badge={nodes.size > 1 ? nodes.size - 1 : undefined}
                onClick={() => setHostAdminTab('participants')}
              />
              <HostTabButton
                label="Chat"
                icon={<MessageCircle className="w-3.5 h-3.5" />}
                active={hostAdminTab === 'chat'}
                onClick={() => setHostAdminTab('chat')}
              />
              <HostTabButton
                label="Slides"
                icon={<Sliders className="w-3.5 h-3.5" />}
                active={hostAdminTab === 'slides'}
                badge={slides.length > 0 ? slides.length : undefined}
                badgeClass="bg-emerald-500/20 text-emerald-400"
                onClick={() => setHostAdminTab('slides')}
              />
              <HostTabButton
                label="Health"
                icon={<Shield className="w-3.5 h-3.5" />}
                active={hostAdminTab === 'health'}
                onClick={() => setHostAdminTab('health')}
              />
              <HostTabButton
                label="Bots"
                icon={<Bot className="w-3.5 h-3.5" />}
                active={hostAdminTab === 'fakeusers'}
                badge={fakeUsers.length > 0 ? fakeUsers.length : undefined}
                badgeClass="bg-violet-500/20 text-violet-400"
                onClick={() => setHostAdminTab('fakeusers')}
              />
              <HostTabButton
                label="As"
                icon={<Eye className="w-3.5 h-3.5" />}
                active={hostAdminTab === 'impersonate'}
                badge={impersonation.isImpersonating ? 1 : undefined}
                badgeClass="bg-amber-500/20 text-amber-400"
                onClick={() => setHostAdminTab('impersonate')}
              />
            </div>
            {/* Tab content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {hostAdminTab === 'waiting' && <WaitingRoom />}
              {hostAdminTab === 'participants' && <ParticipantList standalone />}
              {hostAdminTab === 'chat' && <ChatPanel standalone />}
              {hostAdminTab === 'slides' && <SlideUpload />}
              {hostAdminTab === 'health' && <TreeHealthDashboard />}
              {hostAdminTab === 'fakeusers' && <FakeUsersPanel />}
              {hostAdminTab === 'impersonate' && <ImpersonatePanel />}
            </div>
          </div>
          )}
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
                {/* Drawer header with panel tabs — host version */}
                <div className="flex items-center border-b border-zinc-800">
                  {/* Tab buttons for switching between panels */}
                  <div className="flex flex-1 overflow-x-auto scrollbar-none">
                    {([
                      { key: 'waiting' as const, label: 'Waiting', icon: <Users className="w-3.5 h-3.5" /> },
                      { key: 'participants' as const, label: 'People', icon: <Users className="w-3.5 h-3.5" /> },
                      { key: 'chat' as const, label: 'Chat', icon: <MessageCircle className="w-3.5 h-3.5" /> },
                      { key: 'slides' as const, label: 'Slides', icon: <Sliders className="w-3.5 h-3.5" /> },
                      { key: 'health' as const, label: 'Health', icon: <Shield className="w-3.5 h-3.5" /> },
                      { key: 'fakeusers' as const, label: 'Bots', icon: <Bot className="w-3.5 h-3.5" /> },
                      { key: 'impersonate' as const, label: 'Impersonate', icon: <Eye className="w-3.5 h-3.5" /> },
                    ]).map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setMobileDrawer(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          mobileDrawer === tab.key
                            ? 'text-zinc-100 border-b-2 border-emerald-500'
                            : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
                        }`}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {/* Close button */}
                  <button onClick={() => setMobileDrawer(null)} className="p-2 mr-1 rounded-lg hover:bg-zinc-800 flex-shrink-0">
                    <X className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>
                <div className="overflow-auto max-h-[60vh]">
                  {mobileDrawer === 'chat' && <ChatPanel />}
                  {mobileDrawer === 'participants' && <ParticipantList standalone />}
                  {mobileDrawer === 'files' && <FileSharingPanel />}
                  {mobileDrawer === 'waiting' && <WaitingRoom />}
                  {mobileDrawer === 'slides' && <SlideUpload />}
                  {mobileDrawer === 'health' && <TreeHealthDashboard />}
                  {mobileDrawer === 'fakeusers' && <FakeUsersPanel />}
                  {mobileDrawer === 'impersonate' && <ImpersonatePanel />}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Controls */}
        <Controls
          onMobileDrawerOpen={(type) => setMobileDrawer(type as any)}
          mobileDrawerOpen={!!mobileDrawer}
        />

        {/* Overlays - host-only */}
        <TreeVisualizer />

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

          {/* Grid/Stream toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[9px] sm:text-[10px] text-zinc-400 hover:text-zinc-200 gap-0.5"
            onClick={() => setViewerShowGrid(!viewerShowGrid)}
            title={viewerShowGrid ? 'Back to stream' : 'See all participants'}
          >
            <Users className="w-3 h-3" />
            <span className="hidden sm:inline">{viewerShowGrid ? 'Stream' : 'Grid'}</span>
          </Button>

          {/* Copy invite */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[9px] sm:text-[10px] text-zinc-400 hover:text-zinc-200 gap-0.5"
            onClick={copyInviteUrl}
            title="Copy invite link"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Link2 className="w-3 h-3" />}
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
            {mobileDrawer ? <X className="w-4 h-4 text-zinc-400" /> : <Menu className="w-4 h-4 text-zinc-400" />}
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
        {/* Main: ViewerExperience or Participant Grid */}
        <div className="flex-1 flex flex-col min-w-0">
          {viewerShowGrid ? (
            <div className="flex-1 p-2 sm:p-4 overflow-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 auto-rows-min">
                {Array.from(nodes.values()).map(node => {
                  const isHandRaisedForNode = handRaises.some(h => h.peerId === node.peerId && h.isRaised);
                  const initials = node.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  const rtt = node.bandwidth?.rttMs ?? 999;
                  const connQuality = rtt < 100 ? 'bg-emerald-400' : rtt < 300 ? 'bg-amber-400' : 'bg-red-400';
                  return (
                    <div key={node.peerId} className={`relative bg-zinc-900 border rounded-xl p-3 sm:p-4 flex flex-col items-center gap-2 transition-all ${
                      isHandRaisedForNode ? 'border-amber-500/50 bg-amber-500/5' : 'border-zinc-800 hover:border-zinc-700'
                    }`}>
                      {/* Connection quality dot */}
                      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${connQuality}`} />

                      {/* Avatar */}
                      <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold
                        ${node.role === 'host' ? 'bg-emerald-500/20 text-emerald-400' :
                          node.role === 'co-host' ? 'bg-violet-500/20 text-violet-400' :
                          node.role === 'speaker' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-zinc-800 text-zinc-400'}`}>
                        {node.role === 'host' ? '👑' : initials}
                      </div>

                      {/* Name */}
                      <span className="text-[10px] sm:text-xs text-zinc-300 truncate max-w-full text-center">{node.displayName}</span>

                      {/* Role badge */}
                      <div className="flex items-center gap-1">
                        {node.role === 'host' && <span className="text-[8px] sm:text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">Host</span>}
                        {node.role === 'co-host' && <span className="text-[8px] sm:text-[9px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full">Co-Host</span>}
                        {node.role === 'speaker' && <span className="text-[8px] sm:text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">Speaker</span>}
                      </div>

                      {/* Hand raise indicator */}
                      {isHandRaisedForNode && (
                        <span className="text-[8px] sm:text-[9px] text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          ✋ Raised
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <ViewerExperience />
          )}
        </div>

        {/* Side panels */}
        <div className="hidden sm:flex">
          {isParticipantsOpen && <ParticipantList />}
          {isChatOpen && <ChatPanel />}
          {isFilesOpen && <FileSharingPanel />}
        </div>
      </div>

      {/* Mobile drawer (bottom sheet) — viewer */}
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
              {/* Drawer header with panel tabs */}
              <div className="flex items-center border-b border-zinc-800">
                {/* Tab buttons for switching between panels */}
                <div className="flex flex-1 overflow-x-auto scrollbar-none">
                  {([
                    { key: 'chat' as const, label: 'Chat', icon: <MessageCircle className="w-3.5 h-3.5" /> },
                    { key: 'participants' as const, label: 'People', icon: <Users className="w-3.5 h-3.5" /> },
                    { key: 'files' as const, label: 'Files', icon: <Copy className="w-3.5 h-3.5" /> },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setMobileDrawer(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        mobileDrawer === tab.key
                          ? 'text-zinc-100 border-b-2 border-emerald-500'
                          : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
                {/* Close button */}
                <button onClick={() => setMobileDrawer(null)} className="p-2 mr-1 rounded-lg hover:bg-zinc-800 flex-shrink-0">
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
              <div className="overflow-auto max-h-[60vh]">
                {mobileDrawer === 'chat' && <ChatPanel />}
                {mobileDrawer === 'participants' && <ParticipantList standalone />}
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

// ─────────────────────────────────────────────────────────────
// Host Admin Panel Tab Button
// ─────────────────────────────────────────────────────────────

function HostTabButton({
  label, icon, active, badge, badgeClass, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  badgeClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors relative
        ${active
          ? 'text-zinc-100 border-b-2 border-blue-500'
          : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
        }`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[8px] font-bold
          ${badgeClass || 'bg-zinc-700 text-zinc-300'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
