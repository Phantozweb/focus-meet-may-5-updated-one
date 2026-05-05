'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRoomStore } from '@/store/room-store';
import { WaitingAttendee } from '@/lib/types';
import {
  UserCheck, UserX, Users, Clock, Monitor, Smartphone,
  Tablet, Volume2, VolumeX, CheckCircle2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export function WaitingRoom() {
  const {
    waitingRoom, isHost, engine, myNode,
    removeWaitingAttendee, admitAllWaiting,
    roomInfo,
  } = useRoomStore();

  const [autoAdmit, setAutoAdmit] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevCountRef = useRef(0);

  // Play notification sound when new person joins waiting room
  useEffect(() => {
    if (soundEnabled && waitingRoom.length > prevCountRef.current && prevCountRef.current >= 0) {
      try {
        const ctx = new AudioContext();
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
      } catch {
        // Audio not available
      }
    }
    prevCountRef.current = waitingRoom.length;
  }, [waitingRoom.length, soundEnabled]);

  // Auto-admit: when enabled, automatically admit new attendees
  useEffect(() => {
    if (autoAdmit && waitingRoom.length > 0) {
      const timer = setTimeout(() => {
        admitAllWaiting();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoAdmit, waitingRoom.length, admitAllWaiting]);

  const handleAdmit = useCallback((peerId: string) => {
    if (engine && myNode) {
      engine['broadcastToChildren']?.({
        type: 'waiting-admit',
        payload: { peerId },
        senderId: myNode.peerId,
        senderName: myNode.displayName,
        roomId: '',
        timestamp: Date.now(),
      });
    }
    removeWaitingAttendee(peerId);
  }, [engine, myNode, removeWaitingAttendee]);

  const handleDeny = useCallback((peerId: string) => {
    if (engine && myNode) {
      engine['broadcastToChildren']?.({
        type: 'waiting-deny',
        payload: { peerId },
        senderId: myNode.peerId,
        senderName: myNode.displayName,
        roomId: '',
        timestamp: Date.now(),
      });
    }
    removeWaitingAttendee(peerId);
  }, [engine, myNode, removeWaitingAttendee]);

  const handleAdmitAll = useCallback(() => {
    if (engine && myNode) {
      waitingRoom.forEach((a) => {
        engine['broadcastToChildren']?.({
          type: 'waiting-admit',
          payload: { peerId: a.peerId },
          senderId: myNode.peerId,
          senderName: myNode.displayName,
          roomId: '',
          timestamp: Date.now(),
        });
      });
    }
    admitAllWaiting();
  }, [engine, myNode, waitingRoom, admitAllWaiting]);

  // Only visible to host
  if (!isHost) return null;

  // Nothing to show if empty
  if (waitingRoom.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-400">Waiting Room</span>
        </div>
        <div className="text-center py-6">
          <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-600">No one is waiting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-zinc-200">Waiting Room</span>
            <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/20 text-amber-400 border-0 animate-pulse">
              {waitingRoom.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 hover:text-emerald-300"
            onClick={handleAdmitAll}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Admit All
          </Button>
        </div>

        {/* Settings */}
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-zinc-800/50">
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
      </div>

      {/* Attendee List */}
      <ScrollArea className="flex-1 max-h-96">
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
    </div>
  );
}

// ---------- Individual Attendee Card ----------

function WaitingAttendeeCard({
  attendee,
  onAdmit,
  onDeny,
}: {
  attendee: WaitingAttendee;
  onAdmit: (peerId: string) => void;
  onDeny: (peerId: string) => void;
}) {
  const [now] = useState(Date.now());
  const waitSeconds = Math.floor((now - attendee.joinedAt) / 1000);
  const waitLabel = waitSeconds < 60 ? `${waitSeconds}s` : `${Math.floor(waitSeconds / 60)}m`;

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
    .map(w => w[0])
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
          <span className="text-xs font-medium text-zinc-200 truncate">{attendee.displayName}</span>
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

      {/* Actions */}
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
