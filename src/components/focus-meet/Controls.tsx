'use client';

import { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '@/store/room-store';
import { ReactionType } from '@/lib/types';
import { GitHubClipRecorder } from '@/lib/github-recorder';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  MessageCircle, Users, FileText, Hand, LogOut, Settings,
  Smile, ThumbsUp, PartyPopper, Heart,
  Flame, HandMetal, Laugh, Circle, CircleDot, Loader2,
  Headphones, Presentation, Maximize,
  DoorOpen, Shield, HandHelping,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const REACTION_EMOJIS: { type: ReactionType; icon: React.ReactNode; label: string }[] = [
  { type: 'thumbsup', icon: <ThumbsUp className="w-4 h-4" />, label: '👍' },
  { type: 'clap', icon: <PartyPopper className="w-4 h-4" />, label: '👏' },
  { type: 'heart', icon: <Heart className="w-4 h-4" />, label: '❤️' },
  { type: 'laugh', icon: <Laugh className="w-4 h-4" />, label: '😂' },
  { type: 'fire', icon: <Flame className="w-4 h-4" />, label: '🔥' },
  { type: 'wave', icon: <HandMetal className="w-4 h-4" />, label: '👋' },
];

interface ControlsProps {
  onMobileDrawerOpen?: (type: 'chat' | 'participants' | 'files') => void;
  mobileDrawerOpen?: boolean;
}

export function Controls({ onMobileDrawerOpen, mobileDrawerOpen }: ControlsProps = {}) {
  const {
    localStream, audioEnabled, videoEnabled,
    isChatOpen, isParticipantsOpen, isFilesOpen,
    isTreeVisible, isBenchmarkVisible,
    myNode, engine, screenShare,
    recorder, recordingState,
    setChatOpen, setParticipantsOpen, setFilesOpen,
    setTreeVisible, setBenchmarkVisible,
    setAudioEnabled, setVideoEnabled,
    setLocalStream, setScreenShare,
    setRecorder, setRecordingState,
    addReaction, reset, isHost, roomInfo,
    streamQuality, setStreamQuality,
    isPresenting, setIsPresenting,
    isWaitingRoomEnabled, setWaitingRoomEnabled,
    handRaises, addHandRaise, removeHandRaise,
  } = useRoomStore();

  const isSpeaker = myNode?.role === 'host' || myNode?.role === 'speaker';
  const hasRaisedHand = handRaises.some(h => h.peerId === myNode?.peerId && h.isRaised);
  const isAudioOnly = streamQuality === 'audio-only';
  const [showReactions, setShowReactions] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const reactionsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (reactionsRef.current && !reactionsRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggleAudio = () => {
    if (engine) {
      const enabled = engine.toggleAudio();
      setAudioEnabled(enabled);
    }
  };

  const handleToggleVideo = () => {
    if (engine) {
      const enabled = engine.toggleVideo();
      setVideoEnabled(enabled);
    }
  };

  const handleRequestToSpeak = () => {
    if (engine) engine.requestToSpeak();
  };

  const handleToggleHand = () => {
    if (!engine || !myNode) return;
    if (hasRaisedHand) {
      engine.lowerHand();
      removeHandRaise(myNode.peerId);
    } else {
      engine.raiseHand();
      addHandRaise({
        peerId: myNode.peerId,
        displayName: myNode.displayName,
        isRaised: true,
        raisedAt: Date.now(),
      });
    }
  };

  const handleEndForAll = () => {
    if (engine) engine.destroy();
    reset();
    window.location.hash = '';
  };

  const handleToggleWaitingRoom = () => {
    const newValue = !isWaitingRoomEnabled;
    setWaitingRoomEnabled(newValue);
    engine?.setWaitingRoomEnabled(newValue);
    toast.success(newValue ? 'Waiting room enabled' : 'Waiting room disabled');
  };

  const handleScreenShare = async () => {
    if (!engine) return;

    if (screenShare.isSharing) {
      engine.stopScreenShare();
      setScreenShare({ isSharing: false, sharedBy: null, sharedByName: null, stream: null });
      return;
    }

    try {
      const stream = await engine.startScreenShare();
      if (stream) {
        setScreenShare({
          isSharing: true,
          sharedBy: myNode?.peerId ?? null,
          sharedByName: myNode?.displayName ?? null,
          stream,
        });
      }
    } catch {
      // User cancelled or error
    }
  };

  const handleReaction = (type: ReactionType) => {
    addReaction({
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      senderId: myNode?.peerId || '',
      senderName: myNode?.displayName || '',
      timestamp: Date.now(),
    });
    setShowReactions(false);
  };

  const handleToggleRecording = async () => {
    if (recordingState.isRecording && recorder) {
      await recorder.stopRecording();
      setRecordingState(recorder.getState());
      return;
    }

    if (!localStream) return;

    const newRecorder = new GitHubClipRecorder();
    newRecorder.setOnStateChange((state) => {
      setRecordingState(state);
    });
    setRecorder(newRecorder);

    const roomId = roomInfo?.roomId || 'unknown';
    const started = await newRecorder.startRecording(localStream, roomId);
    if (!started) {
      setRecorder(null);
    }
    setRecordingState(newRecorder.getState());
  };

  const handleLeave = () => {
    if (recorder && recordingState.isRecording) {
      recorder.stopRecording();
    }
    reset();
    window.location.hash = '';
  };

  const isMobile = useIsMobile();

  const handleChatToggle = () => {
    if (onMobileDrawerOpen && isMobile) {
      onMobileDrawerOpen('chat');
    } else {
      setChatOpen(!isChatOpen);
    }
  };

  const handleParticipantsToggle = () => {
    if (onMobileDrawerOpen && isMobile) {
      onMobileDrawerOpen('participants');
    } else {
      setParticipantsOpen(!isParticipantsOpen);
    }
  };

  const handleFilesToggle = () => {
    if (onMobileDrawerOpen && isMobile) {
      onMobileDrawerOpen('files');
    } else {
      setFilesOpen(!isFilesOpen);
    }
  };

  return (
    <div className="bg-zinc-900 border-t border-zinc-800 px-1 sm:px-4 py-2 sm:py-2.5 safe-bottom">
      <div className="flex items-center justify-center gap-0 sm:gap-1 md:gap-1.5 overflow-x-auto scrollbar-none -webkit-overflow-scrolling-touch"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Audio toggle */}
        <ControlButton
          onClick={handleToggleAudio}
          active={audioEnabled}
          activeIcon={<Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
          inactiveIcon={<MicOff className="w-4 h-4 sm:w-5 sm:h-5" />}
          activeLabel="Mute"
          inactiveLabel="Unmute"
          activeClass="bg-zinc-700 hover:bg-zinc-600 text-white"
          inactiveClass="bg-red-600 hover:bg-red-700 text-white"
          isMobile={isMobile}
        />

        {/* Video toggle */}
        <ControlButton
          onClick={handleToggleVideo}
          active={videoEnabled}
          activeIcon={<Video className="w-4 h-4 sm:w-5 sm:h-5" />}
          inactiveIcon={<VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
          activeLabel="Video"
          inactiveLabel="Video"
          activeClass="bg-zinc-700 hover:bg-zinc-600 text-white"
          inactiveClass="bg-red-600 hover:bg-red-700 text-white"
          isMobile={isMobile}
        />

        {/* Screen share (host/speaker only) */}
        {isSpeaker && (
          <ControlButton
            onClick={handleScreenShare}
            active={!screenShare.isSharing}
            activeIcon={<Monitor className="w-4 h-4 sm:w-5 sm:h-5" />}
            inactiveIcon={<MonitorOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            activeLabel="Share"
            inactiveLabel="Sharing"
            activeClass="bg-zinc-700 hover:bg-zinc-600 text-white"
            inactiveClass="bg-emerald-600 hover:bg-emerald-700 text-white"
            isMobile={isMobile}
          />
        )}

        {/* Recording (host only) */}
        {isHost && (
          <ControlButton
            onClick={handleToggleRecording}
            active={!recordingState.isRecording}
            activeIcon={<CircleDot className="w-4 h-4 sm:w-5 sm:h-5" />}
            inactiveIcon={recordingState.isRecording ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Circle className="w-4 h-4 sm:w-5 sm:h-5" />}
            activeLabel="Record"
            inactiveLabel={recordingState.clipCount > 0 ? `${recordingState.clipCount}` : 'Rec'}
            activeClass="bg-zinc-700 hover:bg-zinc-600 text-white"
            inactiveClass="bg-red-600 hover:bg-red-700 text-white animate-pulse"
            isMobile={isMobile}
          />
        )}

        {/* Raise/Lower Hand (viewer only) */}
        {!isSpeaker && (
          <ControlButton
            onClick={handleToggleHand}
            active={hasRaisedHand}
            activeIcon={<Hand className="w-4 h-4 sm:w-5 sm:h-5" />}
            inactiveIcon={<HandHelping className="w-4 h-4 sm:w-5 sm:h-5" />}
            activeLabel="Lower"
            inactiveLabel="Raise"
            activeClass="bg-amber-600/80 hover:bg-amber-600 text-white"
            inactiveClass="bg-zinc-700 hover:bg-zinc-600 text-white"
            isMobile={isMobile}
          />
        )}

        <div className="w-px h-6 sm:h-8 bg-zinc-700 mx-0.5 sm:mx-1 flex-shrink-0" />

        {/* Reactions */}
        <div className="relative flex-shrink-0" ref={reactionsRef}>
          <ControlButton
            onClick={() => setShowReactions(!showReactions)}
            active={false}
            activeIcon={<Smile className="w-4 h-4 sm:w-5 sm:h-5" />}
            inactiveIcon={<Smile className="w-4 h-4 sm:w-5 sm:h-5" />}
            activeLabel="React"
            inactiveLabel="React"
            activeClass="bg-zinc-700 hover:bg-zinc-600 text-white"
            inactiveClass="bg-zinc-700 hover:bg-zinc-600 text-white"
            isMobile={isMobile}
          />
          {showReactions && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-xl p-1.5 flex gap-0.5 shadow-xl z-50">
              {REACTION_EMOJIS.map(r => (
                <button
                  key={r.type}
                  onClick={() => handleReaction(r.type)}
                  className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg hover:bg-zinc-700 flex items-center justify-center text-base sm:text-lg transition-colors touch-manipulation"
                  title={r.type}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat toggle */}
        <ControlButton
          onClick={handleChatToggle}
          active={isChatOpen}
          activeIcon={<MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
          inactiveIcon={<MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
          activeLabel="Chat"
          inactiveLabel="Chat"
          activeClass="bg-blue-600 hover:bg-blue-700 text-white"
          inactiveClass="bg-zinc-700 hover:bg-zinc-600 text-white"
          isMobile={isMobile}
        />

        {/* Participants toggle */}
        <ControlButton
          onClick={handleParticipantsToggle}
          active={isParticipantsOpen}
          activeIcon={<Users className="w-4 h-4 sm:w-5 sm:h-5" />}
          inactiveIcon={<Users className="w-4 h-4 sm:w-5 sm:h-5" />}
          activeLabel="People"
          inactiveLabel="People"
          activeClass="bg-blue-600 hover:bg-blue-700 text-white"
          inactiveClass="bg-zinc-700 hover:bg-zinc-600 text-white"
          isMobile={isMobile}
        />

        {/* Files toggle - hidden on very small mobile */}
        <div className="hidden sm:block flex-shrink-0">
          <ControlButton
            onClick={handleFilesToggle}
            active={isFilesOpen}
            activeIcon={<FileText className="w-4 h-4 sm:w-5 sm:h-5" />}
            inactiveIcon={<FileText className="w-4 h-4 sm:w-5 sm:h-5" />}
            activeLabel="Files"
            inactiveLabel="Files"
            activeClass="bg-blue-600 hover:bg-blue-700 text-white"
            inactiveClass="bg-zinc-700 hover:bg-zinc-600 text-white"
            isMobile={isMobile}
          />
        </div>

        <div className="w-px h-6 sm:h-8 bg-zinc-700 mx-0.5 sm:mx-1 flex-shrink-0" />

        {/* More menu - host only options */}
        {isHost && (
          <div className="relative flex-shrink-0" ref={moreRef}>
            <ControlButton
              onClick={() => setShowMore(!showMore)}
              active={false}
              activeIcon={<Settings className="w-4 h-4 sm:w-5 sm:h-5" />}
              inactiveIcon={<Settings className="w-4 h-4 sm:w-5 sm:h-5" />}
              activeLabel="More"
              inactiveLabel="More"
              activeClass="bg-zinc-700 hover:bg-zinc-600 text-white"
              inactiveClass="bg-zinc-700 hover:bg-zinc-600 text-white"
              isMobile={isMobile}
            />
            {showMore && (
              <div className="absolute bottom-full mb-2 right-0 bg-zinc-800 border border-zinc-700 rounded-xl py-1 shadow-xl min-w-[180px] z-50">
                <MoreMenuItem
                  icon={<Presentation className="w-4 h-4" />}
                  label="Presentation Mode"
                  active={isPresenting}
                  onClick={() => { setIsPresenting(!isPresenting); setShowMore(false); }}
                />
                <MoreMenuItem
                  icon={<Shield className="w-4 h-4" />}
                  label="Waiting Room"
                  active={isWaitingRoomEnabled}
                  onClick={() => { handleToggleWaitingRoom(); setShowMore(false); }}
                />
                <MoreMenuItem
                  icon={<Maximize className="w-4 h-4" />}
                  label="Connection Map"
                  active={isTreeVisible}
                  onClick={() => { setTreeVisible(!isTreeVisible); setShowMore(false); }}
                />
                <MoreMenuItem
                  icon={<Headphones className="w-4 h-4" />}
                  label="Audio Only"
                  active={isAudioOnly}
                  onClick={() => { setStreamQuality(isAudioOnly ? 'auto' : 'audio-only'); setShowMore(false); }}
                />
                <div className="my-1 border-t border-zinc-700" />
                <MoreMenuItem
                  icon={<DoorOpen className="w-4 h-4" />}
                  label="End for All"
                  active={false}
                  danger
                  onClick={() => { handleEndForAll(); setShowMore(false); }}
                />
              </div>
            )}
          </div>
        )}

        {/* Leave */}
        <ControlButton
          onClick={handleLeave}
          active={true}
          activeIcon={<LogOut className="w-4 h-4 sm:w-5 sm:h-5" />}
          inactiveIcon={<LogOut className="w-4 h-4 sm:w-5 sm:h-5" />}
          activeLabel="Leave"
          inactiveLabel="Leave"
          activeClass="bg-red-600 hover:bg-red-700 text-white"
          inactiveClass=""
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

function ControlButton({
  onClick, active, activeIcon, inactiveIcon,
  activeLabel, inactiveLabel, activeClass, inactiveClass,
  isMobile,
}: {
  onClick: () => void;
  active: boolean;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
  activeLabel: string;
  inactiveLabel: string;
  activeClass: string;
  inactiveClass: string;
  isMobile?: boolean;
}) {
  // Mobile: min 44px touch targets; Desktop: standard sizing
  const mobileClasses = isMobile
    ? 'min-w-[44px] min-h-[44px] px-2.5 py-2'
    : 'min-w-[40px] sm:min-w-[52px] px-2 sm:px-2.5 py-1.5 sm:py-2';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`flex flex-col items-center gap-0 sm:gap-0.5 rounded-lg sm:rounded-xl transition-all duration-200 touch-manipulation
              ${mobileClasses}
              ${active ? activeClass : inactiveClass}`}
            style={{ touchAction: 'manipulation' }}
          >
            {active ? activeIcon : inactiveIcon}
            <span className="text-[7px] sm:text-[9px] font-medium leading-none hidden sm:block">{active ? activeLabel : inactiveLabel}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {active ? activeLabel : inactiveLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MoreMenuItem({
  icon, label, active, onClick, danger,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors touch-manipulation
        ${danger
          ? 'text-red-400 hover:bg-red-500/10'
          : active
            ? 'text-blue-400 bg-blue-500/10'
            : 'text-zinc-300 hover:bg-zinc-700'}`}
      style={{ touchAction: 'manipulation', minHeight: '44px' }}
    >
      {icon}
      <span>{label}</span>
      {active && !danger && <span className="ml-auto text-xs text-blue-400">On</span>}
    </button>
  );
}
