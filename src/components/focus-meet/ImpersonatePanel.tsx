'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRoomStore } from '@/store/room-store';
import { ReactionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageCircle, Smile, Hand, Eye, Send, X, Users, AlertTriangle,
  ThumbsUp, PartyPopper, Heart, Flame, HandMetal, Laugh,
} from 'lucide-react';
import { toast } from 'sonner';

const REACTION_OPTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'thumbsup', emoji: '👍', label: 'Thumbs Up' },
  { type: 'clap', emoji: '👏', label: 'Clap' },
  { type: 'heart', emoji: '❤️', label: 'Heart' },
  { type: 'laugh', emoji: '😂', label: 'Laugh' },
  { type: 'fire', emoji: '🔥', label: 'Fire' },
  { type: 'wave', emoji: '👋', label: 'Wave' },
];

export function ImpersonatePanel() {
  const { engine, nodes, myNode, impersonation, startImpersonation, stopImpersonation } = useRoomStore();
  const [chatInput, setChatInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Get all participants (excluding self and host)
  const participants = useMemo(() => {
    const list = Array.from(nodes.values()).filter(
      n => n.peerId !== myNode?.peerId && n.role !== 'host'
    );
    if (!searchQuery.trim()) return list;
    return list.filter(n =>
      n.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.peerId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [nodes, myNode, searchQuery]);

  const handleSelectUser = useCallback((peerId: string, displayName: string) => {
    startImpersonation(peerId, displayName, 'chat');
    toast.info(`Now impersonating ${displayName}`);
  }, [startImpersonation]);

  const handleStopImpersonation = useCallback(() => {
    stopImpersonation();
    toast.info('Stopped impersonation');
  }, [stopImpersonation]);

  const handleSendChat = useCallback(() => {
    if (!engine || !impersonation.targetPeerId || !chatInput.trim()) return;
    engine.sendImpersonatedChat(impersonation.targetPeerId, chatInput.trim());
    setChatInput('');
    toast.success(`Sent chat as ${impersonation.targetDisplayName}`);
  }, [engine, impersonation, chatInput]);

  const handleSendReaction = useCallback((type: ReactionType) => {
    if (!engine || !impersonation.targetPeerId) return;
    engine.sendImpersonatedReaction(impersonation.targetPeerId, type);
    toast.success(`Sent reaction as ${impersonation.targetDisplayName}`);
  }, [engine, impersonation]);

  const handleToggleHand = useCallback(() => {
    if (!engine || !impersonation.targetPeerId) return;
    engine.impersonateHandRaise(impersonation.targetPeerId, true);
    toast.success(`${impersonation.targetDisplayName} raised their hand`);
    // Auto lower after 5s
    setTimeout(() => {
      engine.impersonateHandRaise(impersonation.targetPeerId!, false);
    }, 5000);
  }, [engine, impersonation]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-zinc-200">Impersonate</span>
            <Badge className="h-5 px-1.5 text-[8px] bg-amber-500/20 text-amber-400 border-0">
              Host Only
            </Badge>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">Chat and interact on behalf of any participant</p>
      </div>

      {/* Impersonation active banner */}
      {impersonation.isImpersonating && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-amber-400">
                  {impersonation.targetDisplayName?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-amber-300">
                  Chatting as {impersonation.targetDisplayName}
                </p>
                <p className="text-[9px] text-amber-500/70">Messages will appear from this user</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-amber-400 hover:text-amber-300"
              onClick={handleStopImpersonation}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Chat input */}
          <div className="flex gap-2 mt-2">
            <Input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={`Message as ${impersonation.targetDisplayName}...`}
              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm h-8"
              onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
            />
            <Button
              onClick={handleSendChat}
              disabled={!chatInput.trim()}
              size="icon"
              className="bg-amber-600 hover:bg-amber-700 text-white h-8 w-8 flex-shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-1.5 mt-2">
            {REACTION_OPTIONS.map(r => (
              <button
                key={r.type}
                onClick={() => handleSendReaction(r.type)}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                title={`React as ${impersonation.targetDisplayName}: ${r.label}`}
              >
                {r.emoji}
              </button>
            ))}
            <button
              onClick={handleToggleHand}
              className="h-7 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-[10px] text-amber-400 transition-colors gap-1"
            >
              <Hand className="w-3 h-3" />Raise
            </button>
          </div>

          {/* Warning */}
          <div className="flex items-center gap-1.5 mt-2">
            <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
            <p className="text-[9px] text-amber-500/70">
              Messages appear as this user to all participants. Use responsibly.
            </p>
          </div>
        </div>
      )}

      {/* Participant search */}
      <div className="px-4 py-2 border-b border-zinc-800 flex-shrink-0">
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search participants..."
          className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm h-8"
        />
      </div>

      {/* Participants list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {participants.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-600">No participants to impersonate</p>
            </div>
          ) : (
            participants.map(node => (
              <button
                key={node.peerId}
                onClick={() => handleSelectUser(node.peerId, node.displayName)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left ${
                  impersonation.targetPeerId === node.peerId
                    ? 'bg-amber-500/10 border border-amber-500/30'
                    : 'bg-zinc-900/50 border border-transparent hover:bg-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  node.peerId.startsWith('fake-')
                    ? 'bg-violet-500/15 text-violet-400'
                    : 'bg-zinc-700 text-zinc-300'
                }`}>
                  {node.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-zinc-200 truncate">
                      {node.displayName}
                    </span>
                    {node.peerId.startsWith('fake-') && (
                      <Badge className="h-3.5 px-1 text-[7px] bg-violet-500/20 text-violet-400 border-0">Fake</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-600">
                    {node.role} · {node.device?.deviceType || 'unknown'}
                  </p>
                </div>
                {impersonation.targetPeerId === node.peerId && (
                  <Eye className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
