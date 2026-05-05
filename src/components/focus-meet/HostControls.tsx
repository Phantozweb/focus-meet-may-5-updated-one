'use client';

import { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '@/store/room-store';
import { ModerationAction } from '@/lib/types';
import {
  Shield, Lock, Unlock, MicOff, Hand, Trash2, AlertTriangle,
  X, ChevronDown, Users, LogOut, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

export function HostControls() {
  const {
    isHost, myNode, engine, nodes,
    handRaises, waitingRoom, roomLock,
    setRoomLock, lowerAllHands, addModerationAction,
    reset,
  } = useRoomStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowConfirmEnd(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isHost) return null;

  const viewerNodes = Array.from(nodes.values()).filter(
    n => n.role === 'viewer' || n.role === 'speaker'
  );
  const raisedCount = handRaises.filter(h => h.isRaised).length;

  const handleToggleLock = () => {
    const newLock = {
      isLocked: !roomLock.isLocked,
      lockedAt: roomLock.isLocked ? null : Date.now(),
      lockedBy: roomLock.isLocked ? null : myNode?.peerId || null,
    };
    setRoomLock(newLock);
    if (engine && myNode) {
      engine['broadcastToChildren']?.({
        type: newLock.isLocked ? 'room-lock' : 'room-unlock',
        payload: newLock,
        senderId: myNode.peerId,
        senderName: myNode.displayName,
        roomId: '',
        timestamp: Date.now(),
      });
    }
  };

  const handleMuteAll = () => {
    if (!engine || !myNode) return;
    viewerNodes.forEach((node) => {
      const action: ModerationAction = {
        type: 'mute',
        targetPeerId: node.peerId,
        targetName: node.displayName,
        performedBy: myNode.peerId,
        timestamp: Date.now(),
        reason: 'Host muted all',
      };
      addModerationAction(action);
      engine['broadcastToChildren']?.({
        type: 'moderation-action',
        payload: action,
        senderId: myNode.peerId,
        senderName: myNode.displayName,
        roomId: '',
        timestamp: Date.now(),
      });
    });
  };

  const handleLowerAllHands = () => {
    lowerAllHands();
    if (engine && myNode) {
      engine['broadcastToChildren']?.({
        type: 'moderation-action',
        payload: {
          type: 'lower-hand',
          performedBy: myNode.peerId,
          timestamp: Date.now(),
        },
        senderId: myNode.peerId,
        senderName: myNode.displayName,
        roomId: '',
        timestamp: Date.now(),
      });
    }
  };

  const handleEndForAll = () => {
    if (engine && myNode) {
      engine['broadcastToChildren']?.({
        type: 'node-disconnect',
        payload: { reason: 'Webinar ended by host' },
        senderId: myNode.peerId,
        senderName: myNode.displayName,
        roomId: '',
        timestamp: Date.now(),
      });
    }
    reset();
    window.location.hash = '';
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Toggle button — compact, always visible */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => { setIsOpen(!isOpen); setShowConfirmEnd(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                ${isOpen
                  ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/30'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'}`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Host</span>
              {waitingRoom.length > 0 && (
                <Badge className="h-4 px-1 text-[9px] bg-amber-500/20 text-amber-400 border-0 ml-1">
                  {waitingRoom.length}
                </Badge>
              )}
              {raisedCount > 0 && (
                <Badge className="h-4 px-1 text-[9px] bg-amber-500/20 text-amber-400 border-0 ml-0.5">
                  ✋ {raisedCount}
                </Badge>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Host Controls</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/50 border-b border-zinc-700">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-zinc-200">Host Controls</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-px bg-zinc-800">
            <StatCell label="Participants" value={nodes.size} />
            <StatCell label="Waiting" value={waitingRoom.length} accent={waitingRoom.length > 0} />
            <StatCell label="Raised" value={raisedCount} accent={raisedCount > 0} />
          </div>

          {/* Actions */}
          <div className="p-2 space-y-0.5">
            {/* Lock Room */}
            <ActionButton
              icon={roomLock.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              label={roomLock.isLocked ? 'Unlock Room' : 'Lock Room'}
              subtitle={roomLock.isLocked ? 'New attendees blocked' : 'Prevent new joins'}
              active={roomLock.isLocked}
              activeColor="amber"
              onClick={handleToggleLock}
            />

            {/* Mute All */}
            <ActionButton
              icon={<MicOff className="w-4 h-4" />}
              label="Mute All Participants"
              subtitle={`Mute ${viewerNodes.length} participants`}
              onClick={handleMuteAll}
            />

            {/* Lower All Hands */}
            {raisedCount > 0 && (
              <ActionButton
                icon={<Hand className="w-4 h-4" />}
                label={`Lower All Hands (${raisedCount})`}
                subtitle="Force lower all raised hands"
                onClick={handleLowerAllHands}
              />
            )}
          </div>

          <Separator className="bg-zinc-800" />

          {/* End webinar */}
          <div className="p-2">
            {!showConfirmEnd ? (
              <ActionButton
                icon={<AlertTriangle className="w-4 h-4" />}
                label="End Session for All"
                subtitle="Disconnect everyone and close room"
                danger
                onClick={() => setShowConfirmEnd(true)}
              />
            ) : (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-2">
                <p className="text-xs text-red-400 font-medium">End session for everyone?</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 h-7 text-xs"
                    onClick={handleEndForAll}
                  >
                    <LogOut className="w-3 h-3 mr-1" />
                    End Now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-7 text-xs text-zinc-400"
                    onClick={() => setShowConfirmEnd(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function StatCell({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-zinc-900 px-3 py-2 text-center">
      <div className={`text-sm font-bold ${accent ? 'text-amber-400' : 'text-zinc-200'}`}>
        {value}
      </div>
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  subtitle,
  active,
  activeColor,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  active?: boolean;
  activeColor?: 'amber' | 'emerald';
  danger?: boolean;
  onClick: () => void;
}) {
  const colorClass = danger
    ? 'text-red-400 hover:bg-red-500/10'
    : active
      ? activeColor === 'amber'
        ? 'text-amber-400 bg-amber-500/5'
        : 'text-emerald-400 bg-emerald-500/5'
      : 'text-zinc-300 hover:bg-zinc-800';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${colorClass}`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="text-left min-w-0">
        <div className="text-xs font-medium">{label}</div>
        {subtitle && <div className="text-[10px] text-zinc-600">{subtitle}</div>}
      </div>
      {active && (
        <div className="ml-auto flex-shrink-0">
          {activeColor === 'amber' ? (
            <Lock className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </div>
      )}
    </button>
  );
}
