// Focus Meet — Zustand Store (Fractal Mesh v3 — Full Webinar UI)

import { create } from 'zustand';
import {
  TreeNode, RoomInfo, Cluster, ChatMessage, SpeakerRequest,
  NodeStatus, StreamHealth, StreamQuality, DeviceCapability, BandwidthProbe,
  NetworkHealthSnapshot, BenchmarkResult, SharedFile, Reaction, ReactionType,
  ScreenShareState, ViewMode, HandRaise, WaitingAttendee, ModerationAction, RoomLock,
} from '@/lib/types';
import { FractalMeshEngine } from '@/lib/peer-tree';
import { GitHubClipRecorder, RecordingState } from '@/lib/github-recorder';

interface RoomState {
  // Core room state
  isInRoom: boolean; isHost: boolean; connectionStatus: NodeStatus;
  roomInfo: RoomInfo | null; myNode: TreeNode | null; nodes: Map<string, TreeNode>;
  clusters: Map<string, Cluster>;

  // Media
  localStream: MediaStream | null; incomingStream: MediaStream | null;
  audioEnabled: boolean; videoEnabled: boolean;
  streamHealth: StreamHealth | null; streamQuality: StreamQuality;

  // Chat & participants
  chatMessages: ChatMessage[]; speakerRequests: SpeakerRequest[];

  // UI panels
  isChatOpen: boolean; isParticipantsOpen: boolean; isFilesOpen: boolean;
  isTreeVisible: boolean; isBenchmarkVisible: boolean;
  viewMode: ViewMode;

  // User
  displayName: string;

  // Engine
  engine: FractalMeshEngine | null;

  // Device & network
  myDevice: DeviceCapability | null;
  bandwidthProbes: Map<string, BandwidthProbe>;
  networkHealth: NetworkHealthSnapshot | null;
  networkHistory: NetworkHealthSnapshot[];

  // Benchmark
  benchmarkResult: BenchmarkResult | null;
  benchmarkRunning: boolean;
  benchmarkProgress: { phase: string; progress: number } | null;

  // File sharing
  sharedFiles: SharedFile[];

  // Screen share
  screenShare: ScreenShareState;

  // Reactions
  reactions: Reaction[];

  // Hand raise
  handRaises: HandRaise[];

  // Waiting room
  waitingRoom: WaitingAttendee[];

  // Room lock
  roomLock: RoomLock;

  // Moderation
  moderationLog: ModerationAction[];

  // Recording
  recorder: GitHubClipRecorder | null;
  recordingState: RecordingState;

  // Slides
  slides: string[];
  currentSlideIndex: number;
  isPresenting: boolean;

  // Host / co-host
  isCoHost: boolean;
  coHosts: string[];

  // Waiting room
  isWaitingRoomEnabled: boolean;
  waitingForAdmission: boolean;
  wasDeniedFromWaitingRoom: boolean;

  // Room lock
  isRoomLocked: boolean;

  // Callbacks
  slideChangeCallback: ((slideIndex: number) => void) | null;
  annotationCallback: ((annotation: { type: string; x: number; y: number; data?: any }) => void) | null;

  // Setters
  setEngine: (e: FractalMeshEngine) => void;
  setInRoom: (v: boolean) => void; setIsHost: (v: boolean) => void;
  setRoomInfo: (v: RoomInfo | null) => void; setMyNode: (v: TreeNode | null) => void;
  setNodes: (v: Map<string, TreeNode>) => void; setClusters: (v: Map<string, Cluster>) => void;
  setLocalStream: (v: MediaStream | null) => void; setIncomingStream: (v: MediaStream | null) => void;
  setAudioEnabled: (v: boolean) => void; setVideoEnabled: (v: boolean) => void;
  setStreamHealth: (v: StreamHealth | null) => void; setStreamQuality: (v: StreamQuality) => void;
  addChatMessage: (m: ChatMessage) => void;
  addSpeakerRequest: (r: SpeakerRequest) => void; removeSpeakerRequest: (id: string) => void;
  setChatOpen: (v: boolean) => void; setParticipantsOpen: (v: boolean) => void;
  setFilesOpen: (v: boolean) => void;
  setTreeVisible: (v: boolean) => void; setBenchmarkVisible: (v: boolean) => void;
  setViewMode: (v: ViewMode) => void; setDisplayName: (v: string) => void;
  setConnectionStatus: (v: NodeStatus) => void;
  setMyDevice: (v: DeviceCapability) => void;
  setBandwidthProbes: (v: Map<string, BandwidthProbe>) => void;
  setNetworkHealth: (v: NetworkHealthSnapshot) => void;
  addNetworkHistory: (v: NetworkHealthSnapshot) => void;
  setBenchmarkResult: (v: BenchmarkResult | null) => void;
  setBenchmarkRunning: (v: boolean) => void;
  setBenchmarkProgress: (v: { phase: string; progress: number } | null) => void;

  // File sharing
  addSharedFile: (f: SharedFile) => void;
  updateSharedFile: (id: string, updates: Partial<SharedFile>) => void;
  removeSharedFile: (id: string) => void;

  // Screen share
  setScreenShare: (v: ScreenShareState) => void;

  // Reactions
  addReaction: (r: Reaction) => void;
  clearReactions: () => void;

  // Hand raise
  addHandRaise: (hr: HandRaise) => void;
  removeHandRaise: (peerId: string) => void;
  lowerAllHands: () => void;

  // Waiting room
  addWaitingAttendee: (a: WaitingAttendee) => void;
  removeWaitingAttendee: (peerId: string) => void;
  admitAllWaiting: () => void;

  // Room lock
  setRoomLock: (lock: RoomLock) => void;

  // Moderation
  addModerationAction: (action: ModerationAction) => void;

  // Recording
  setRecorder: (r: GitHubClipRecorder | null) => void;
  setRecordingState: (s: RecordingState) => void;

  // Slides
  setSlides: (slides: string[]) => void;
  setCurrentSlideIndex: (index: number) => void;
  setIsPresenting: (presenting: boolean) => void;

  // Host / co-host
  setIsCoHost: (v: boolean) => void;
  setCoHosts: (v: string[]) => void;

  // Waiting room
  setWaitingRoomEnabled: (v: boolean) => void;
  setWaitingForAdmission: (v: boolean) => void;
  setWasDeniedFromWaitingRoom: (v: boolean) => void;

  // Room lock
  setIsRoomLocked: (v: boolean) => void;

  // Callbacks
  setSlideChangeCallback: (cb: ((slideIndex: number) => void) | null) => void;
  setAnnotationCallback: (cb: ((annotation: { type: string; x: number; y: number; data?: any }) => void) | null) => void;

  reset: () => void;
}

const init = {
  isInRoom: false, isHost: false, connectionStatus: 'disconnected' as NodeStatus,
  roomInfo: null as RoomInfo | null, myNode: null as TreeNode | null,
  nodes: new Map<string, TreeNode>(), clusters: new Map<string, Cluster>(),
  localStream: null as MediaStream | null, incomingStream: null as MediaStream | null,
  audioEnabled: true, videoEnabled: true,
  streamHealth: null as StreamHealth | null, streamQuality: 'auto' as StreamQuality,
  chatMessages: [] as ChatMessage[], speakerRequests: [] as SpeakerRequest[],
  isChatOpen: false, isParticipantsOpen: false, isFilesOpen: false,
  isTreeVisible: false, isBenchmarkVisible: false, viewMode: 'speaker' as ViewMode,
  displayName: '',
  engine: null as FractalMeshEngine | null, myDevice: null as DeviceCapability | null,
  bandwidthProbes: new Map<string, BandwidthProbe>(),
  networkHealth: null as NetworkHealthSnapshot | null,
  networkHistory: [] as NetworkHealthSnapshot[],
  benchmarkResult: null as BenchmarkResult | null,
  benchmarkRunning: false,
  benchmarkProgress: null as { phase: string; progress: number } | null,
  sharedFiles: [] as SharedFile[],
  screenShare: { isSharing: false, sharedBy: null, sharedByName: null, stream: null } as ScreenShareState,
  reactions: [] as Reaction[],
  handRaises: [] as HandRaise[],
  waitingRoom: [] as WaitingAttendee[],
  roomLock: { isLocked: false, lockedAt: null, lockedBy: null } as RoomLock,
  moderationLog: [] as ModerationAction[],
  recorder: null as GitHubClipRecorder | null,
  recordingState: { isRecording: false, clipCount: 0, totalUploadedBytes: 0, lastUploadTime: null, error: null, currentClipIndex: 1 } as RecordingState,
  slides: [] as string[],
  currentSlideIndex: 0,
  isPresenting: false,
  isCoHost: false,
  coHosts: [] as string[],
  isWaitingRoomEnabled: true,
  waitingForAdmission: false,
  wasDeniedFromWaitingRoom: false,
  isRoomLocked: false,
  slideChangeCallback: null as ((slideIndex: number) => void) | null,
  annotationCallback: null as ((annotation: { type: string; x: number; y: number; data?: any }) => void) | null,
};

export const useRoomStore = create<RoomState>((set, get) => ({
  ...init,
  setEngine: (engine) => set({ engine }),
  setInRoom: (isInRoom) => set({ isInRoom }),
  setIsHost: (isHost) => set({ isHost }),
  setRoomInfo: (roomInfo) => set({ roomInfo }),
  setMyNode: (myNode) => set({ myNode }),
  setNodes: (nodes) => set({ nodes: new Map(nodes) }),
  setClusters: (clusters) => set({ clusters: new Map(clusters) }),
  setLocalStream: (localStream) => set({ localStream }),
  setIncomingStream: (incomingStream) => set({ incomingStream }),
  setAudioEnabled: (audioEnabled) => set({ audioEnabled }),
  setVideoEnabled: (videoEnabled) => set({ videoEnabled }),
  setStreamHealth: (streamHealth) => set({ streamHealth }),
  setStreamQuality: (streamQuality) => set({ streamQuality }),
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg].slice(-200) })),
  addSpeakerRequest: (req) => set((s) => {
    if (s.speakerRequests.some(r => r.peerId === req.peerId)) return s;
    return { speakerRequests: [...s.speakerRequests, req] };
  }),
  removeSpeakerRequest: (peerId) => set((s) => ({ speakerRequests: s.speakerRequests.filter(r => r.peerId !== peerId) })),
  setChatOpen: (v) => set((s) => ({ isChatOpen: v, isParticipantsOpen: v ? false : s.isParticipantsOpen, isFilesOpen: v ? false : s.isFilesOpen })),
  setParticipantsOpen: (v) => set((s) => ({ isParticipantsOpen: v, isChatOpen: v ? false : s.isChatOpen, isFilesOpen: v ? false : s.isFilesOpen })),
  setFilesOpen: (v) => set((s) => ({ isFilesOpen: v, isChatOpen: v ? false : s.isChatOpen, isParticipantsOpen: v ? false : s.isParticipantsOpen })),
  setTreeVisible: (isTreeVisible) => set({ isTreeVisible }),
  setBenchmarkVisible: (isBenchmarkVisible) => set({ isBenchmarkVisible }),
  setViewMode: (viewMode) => set({ viewMode }),
  setDisplayName: (displayName) => set({ displayName }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setMyDevice: (myDevice) => set({ myDevice }),
  setBandwidthProbes: (bandwidthProbes) => set({ bandwidthProbes: new Map(bandwidthProbes) }),
  setNetworkHealth: (networkHealth) => set({ networkHealth }),
  addNetworkHistory: (snapshot) => set((s) => ({
    networkHistory: [...s.networkHistory, snapshot].slice(-60),
    networkHealth: snapshot,
  })),
  setBenchmarkResult: (benchmarkResult) => set({ benchmarkResult }),
  setBenchmarkRunning: (benchmarkRunning) => set({ benchmarkRunning }),
  setBenchmarkProgress: (benchmarkProgress) => set({ benchmarkProgress }),

  // File sharing
  addSharedFile: (f) => set((s) => ({ sharedFiles: [...s.sharedFiles, f] })),
  updateSharedFile: (id, updates) => set((s) => ({
    sharedFiles: s.sharedFiles.map(f => f.id === id ? { ...f, ...updates } : f),
  })),
  removeSharedFile: (id) => set((s) => ({
    sharedFiles: s.sharedFiles.filter(f => f.id !== id),
  })),

  // Screen share
  setScreenShare: (screenShare) => set({ screenShare }),

  // Reactions
  addReaction: (r) => set((s) => ({ reactions: [...s.reactions, r].slice(-20) })),
  clearReactions: () => set({ reactions: [] }),

  // Hand raise
  addHandRaise: (hr) => set((s) => {
    const existing = s.handRaises.find(h => h.peerId === hr.peerId);
    if (existing) {
      return { handRaises: s.handRaises.map(h => h.peerId === hr.peerId ? hr : h) };
    }
    return { handRaises: [...s.handRaises, hr] };
  }),
  removeHandRaise: (peerId) => set((s) => ({
    handRaises: s.handRaises.filter(h => h.peerId !== peerId),
  })),
  lowerAllHands: () => set((s) => ({
    handRaises: s.handRaises.map(h => ({ ...h, isRaised: false })),
  })),

  // Waiting room
  addWaitingAttendee: (a) => set((s) => {
    if (s.waitingRoom.some(w => w.peerId === a.peerId)) return s;
    return { waitingRoom: [...s.waitingRoom, a] };
  }),
  removeWaitingAttendee: (peerId) => set((s) => ({
    waitingRoom: s.waitingRoom.filter(w => w.peerId !== peerId),
  })),
  admitAllWaiting: () => set((s) => ({ waitingRoom: [] })),

  // Room lock
  setRoomLock: (lock) => set({ roomLock: lock }),

  // Moderation
  addModerationAction: (action) => set((s) => ({
    moderationLog: [...s.moderationLog, action].slice(-100),
  })),

  // Recording
  setRecorder: (recorder) => set({ recorder }),
  setRecordingState: (recordingState) => set({ recordingState }),

  // Slides
  setSlides: (slides) => set({ slides }),
  setCurrentSlideIndex: (currentSlideIndex) => set({ currentSlideIndex }),
  setIsPresenting: (isPresenting) => set({ isPresenting }),

  // Host / co-host
  setIsCoHost: (isCoHost) => set({ isCoHost }),
  setCoHosts: (coHosts) => set({ coHosts }),

  // Waiting room
  setWaitingRoomEnabled: (isWaitingRoomEnabled) => set({ isWaitingRoomEnabled }),
  setWaitingForAdmission: (waitingForAdmission) => set({ waitingForAdmission }),
  setWasDeniedFromWaitingRoom: (wasDeniedFromWaitingRoom) => set({ wasDeniedFromWaitingRoom }),

  // Room lock
  setIsRoomLocked: (isRoomLocked) => set({ isRoomLocked }),

  // Callbacks
  setSlideChangeCallback: (slideChangeCallback) => set({ slideChangeCallback }),
  setAnnotationCallback: (annotationCallback) => set({ annotationCallback }),

  reset: () => {
    const { engine, recorder } = get();
    if (engine) engine.destroy();
    if (recorder) recorder.destroy();
    set({ ...init, engine: null, recorder: null });
  },
}));
