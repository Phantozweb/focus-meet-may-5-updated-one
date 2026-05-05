'use client';

import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { useRoomStore } from '@/store/room-store';
import { WaitingAttendee } from '@/lib/types';
import { getSharedAudioContext } from '@/lib/audio-context';
import {
  UserCheck, UserX, Users, Clock, Monitor, Smartphone,
  Tablet, Volume2, VolumeX, CheckCircle2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { motion, AnimatePresence } from 'framer-motion';

export function WaitingRoom() {
  const {
    waitingRoom, isHost, isCoHost, engine,
    removeWaitingAttendee, admitAllWaiting,
  } = useRoomStore();

  const [autoAdmit, setAutoAdmit] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const prevCountRef = useRef(0);
  const prevNotifCountRef = useRef(0);

  // Auto-expand when someone enters the waiting room
  useEffect(() => {
    if (waitingRoom.length > 0 && prevCountRef.current === 0) {
      startTransition(() => {
        setIsExpanded(true);
      });
    }
    prevCountRef.current = waitingRoom.length;
  }, [waitingRoom.length]);

  // Play notification sound when a new person joins waiting room
  useEffect(() => {
    if (soundEnabled && waitingRoom.length > prevNotifCountRef.current && prevNotifCountRef.current > 0) {
      try {
        const ctx = getSharedAudioContext();
        if (ctx) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          osc.type = 'sine';
          gain.gain.value = 0.1;
          osc.start();
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.stop(ctx.currentTime + 0.3);
        }
      } catch {
        // Audio not available
      }
    }
    prevNotifCountRef.current = waitingRoom.length;
  }, [waitingRoom.length, soundEnabled]);

  // Auto-admit: when enabled, automatically admit new attendees
  useEffect(() => {
    if (autoAdmit && waitingRoom.length > 0) {
      const timer = setTimeout(() => {
        waitingRoom.forEach((a) => {
          engine?.admitFromWaitingRoom(a.peerId);
        });
        admitAllWaiting();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoAdmit, waitingRoom.length, admitAllWaiting, engine, waitingRoom]);

  const handleAdmit = useCallback((peerId: string) => {
    engine?.admitFromWaitingRoom(peerId);
    removeWaitingAttendee(peerId);
  }, [engine, removeWaitingAttendee]);

  const handleDeny = useCallback((peerId: string) => {
    engine?.denyFromWaitingRoom(peerId);
    removeWaitingAttendee(peerId);
  }, [engine, removeWaitingAttendee]);

  const handleAdmitAll = useCallback(() => {
    waitingRoom.forEach((a) => {
      engine?.admitFromWaitingRoom(a.peerId);
    });
    admitAllWaiting();
  }, [engine, waitingRoom, admitAllWaiting]);

  // Only visible to host (and co-host)
  if (!isHost && !isCoHost) return null;

  return (
    <div className="flex flex-col">
      {/* Collapsible header — always visible */}
      <div
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/50 transition-colors cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsExpanded(!isExpanded); }}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          )}
          <Users className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-zinc-200">Waiting Room</span>
          {waitingRoom.length > 0 && (
            <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/20 text-amber-400 border-0 animate-pulse">
              {waitingRoom.length}
            </Badge>
          )}
        </div>
        {/* Quick admit-all when collapsed */}
        {!isExpanded && waitingRoom.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 hover:text-emerald-300"
            onClick={(e) => { e.stopPropagation(); handleAdmitAll(); }}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Admit All
          </Button>
        )}
      </div>

      {/* Expandable body */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* Settings row */}
            <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800/50">
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoAdmit}
                  onCheckedChange={setAutoAdmit}
                  className="data-[state=checked]:bg-emerald-600"
                />
                <span className="text-[10px] text-zinc-500">Auto-admit</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-3 h-3 text-zinc-400" />
                  ) : (
                    <VolumeX className="w-3 h-3 text-zinc-600" />
                  )}
                </Button>
                <span className="text-[10px] text-zinc-500">Sound</span>
              </div>
            </div>

            {/* Attendee list or empty state */}
            {waitingRoom.length === 0 ? (
              <div className="text-center py-6 px-4">
                <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-600">No one is waiting</p>
              </div>
            ) : (
              <>
                {/* Admit all bar */}
                <div className="px-4 py-2 border-b border-zinc-800/50 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 hover:text-emerald-300"
                    onClick={handleAdmitAll}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Admit All ({waitingRoom.length})
                  </Button>
                </div>

                {/* Scrollable attendee list */}
                <ScrollArea className="max-h-64">
                  <div className="p-3 space-y-1.5">
                    {waitingRoom.map((attendee) => (
                      <WaitingAttendeeCard
                        key={attendee.peerId}
                        attendee={attendee}
                        onAdmit={handleAdmit}
                        onDeny={handleDeny}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Individual attendee card with live wait-time counter
// ─────────────────────────────────────────────────────────────

function WaitingAttendeeCard({
  attendee,
  onAdmit,
  onDeny,
}: {
  attendee: WaitingAttendee;
  onAdmit: (peerId: string) => void;
  onDeny: (peerId: string) => void;
}) {
  const [now, setNow] = useState(Date.now());

  // Live timer — updates every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const waitSeconds = Math.max(0, Math.floor((now - attendee.joinedAt) / 1000));
  const waitLabel =
    waitSeconds < 60
      ? `${waitSeconds}s`
      : `${Math.floor(waitSeconds / 60)}m ${waitSeconds % 60}s`;

  const deviceIcon = attendee.device.isMobile ? (
    attendee.device.deviceType === 'tablet' ? (
      <Tablet className="w-3 h-3 text-zinc-500" />
    ) : (
      <Smartphone className="w-3 h-3 text-zinc-500" />
    )
  ) : (
    <Monitor className="w-3 h-3 text-zinc-500" />
  );

  const initials = attendee.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-colors group">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400 flex-shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-200 truncate">
            {attendee.displayName}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {deviceIcon}
          <span className="text-[10px] text-zinc-600">{attendee.device.deviceType}</span>
          <div className="flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5 text-zinc-600" />
            <span className="text-[10px] text-zinc-600">{waitLabel}</span>
          </div>
        </div>
      </div>

      {/* Actions — Admit (green) & Deny (red) */}
      <div className="flex gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
          onClick={() => onAdmit(attendee.peerId)}
          title="Admit"
        >
          <UserCheck className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={() => onDeny(attendee.peerId)}
          title="Deny"
        >
          <UserX className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
