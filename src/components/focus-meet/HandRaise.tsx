'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRoomStore } from '@/store/room-store';
import { HandRaise as HandRaiseType } from '@/lib/types';
import {
  Hand, HandMetal, X, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ---------- Hand Raise Button (for viewer controls) ----------

export function HandRaiseButton() {
  const { myNode, handRaises, addHandRaise, removeHandRaise, engine } = useRoomStore();
  const isSpeaker = myNode?.role === 'host' || myNode?.role === 'speaker';
  const myPeerId = myNode?.peerId || '';
  const myHand = handRaises.find(h => h.peerId === myPeerId);
  const isRaised = myHand?.isRaised ?? false;

  const handleToggle = useCallback(() => {
    if (isRaised) {
      removeHandRaise(myPeerId);
      // Broadcast hand-lower signal
      if (engine && myNode) {
        engine['broadcastToChildren']?.({
          type: 'hand-lower',
          payload: { peerId: myPeerId },
          senderId: myPeerId,
          senderName: myNode.displayName,
          roomId: '',
          timestamp: Date.now(),
        });
      }
    } else {
      const hr: HandRaiseType = {
        peerId: myPeerId,
        displayName: myNode?.displayName || 'Anonymous',
        raisedAt: Date.now(),
        isRaised: true,
      };
      addHandRaise(hr);
      // Broadcast hand-raise signal
      if (engine && myNode) {
        engine['broadcastToChildren']?.({
          type: 'hand-raise',
          payload: hr,
          senderId: myPeerId,
          senderName: myNode.displayName,
          roomId: '',
          timestamp: Date.now(),
        });
      }
    }
  }, [isRaised, myPeerId, myNode, engine, addHandRaise, removeHandRaise]);

  // Viewers and speakers can raise hands, host doesn't need to
  if (isSpeaker && myNode?.role === 'host') return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleToggle}
            className={`flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-200 min-w-[44px] sm:min-w-[56px]
              ${isRaised
                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 ring-1 ring-amber-500/40'
                : 'bg-zinc-700 hover:bg-zinc-600 text-white'}`}
          >
            <span className={`text-lg sm:text-xl ${isRaised ? 'animate-pulse' : ''}`}>
              ✋
            </span>
            <span className="text-[8px] sm:text-[10px] font-medium leading-none">
              {isRaised ? 'Lower' : 'Raise'}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isRaised ? 'Lower Hand' : 'Raise Hand'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------- Raised Hands List (for host/speaker in participant panel) ----------

export function RaisedHandsList() {
  const { handRaises, isHost, removeHandRaise, addModerationAction, myNode, engine } = useRoomStore();
  const [now, setNow] = useState(Date.now());

  // Tick every 10s to update duration display
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const raisedHands = handRaises.filter(h => h.isRaised);

  if (raisedHands.length === 0) return null;

  const formatDuration = (raisedAt: number) => {
    const diff = Math.floor((now - raisedAt) / 1000);
    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    return `${mins}m`;
  };

  const handleLowerHand = (peerId: string, name: string) => {
    removeHandRaise(peerId);
    addModerationAction({
      type: 'lower-hand',
      targetPeerId: peerId,
      targetName: name,
      performedBy: myNode?.peerId || '',
      timestamp: Date.now(),
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <Hand className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
          Raised Hands
        </span>
        <Badge className="h-4 px-1.5 text-[10px] bg-amber-500/20 text-amber-400 border-0">
          {raisedHands.length}
        </Badge>
      </div>
      <ScrollArea className="max-h-48">
        <div className="space-y-1">
          {raisedHands
            .sort((a, b) => a.raisedAt - b.raisedAt) // First raised = first in list
            .map((hr) => (
              <div
                key={hr.peerId}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-amber-500/5 border border-amber-500/10 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base animate-pulse">✋</span>
                  <span className="text-xs text-zinc-300 truncate">{hr.displayName}</span>
                  <div className="flex items-center gap-0.5 text-zinc-600">
                    <Clock className="w-3 h-3" />
                    <span className="text-[10px]">{formatDuration(hr.raisedAt)}</span>
                  </div>
                </div>
                {isHost && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={() => handleLowerHand(hr.peerId, hr.displayName)}
                    title="Lower hand"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}
