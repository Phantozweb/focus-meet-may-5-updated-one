'use client';

import { useRoomStore } from '@/store/room-store';
import { TreeNode } from '@/lib/types';
import {
  Crown, Mic, MicOff, Hand, Check, X, User,
  ChevronDown, ChevronRight, Search, Wifi, WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function ParticipantList() {
  const { nodes, myNode, speakerRequests, engine, removeSpeakerRequest, isParticipantsOpen, setParticipantsOpen } =
    useRoomStore();
  const [search, setSearch] = useState('');

  const allNodes = Array.from(nodes.values());
  const filteredNodes = search.trim()
    ? allNodes.filter(n => n.displayName.toLowerCase().includes(search.toLowerCase()))
    : allNodes;

  const hosts = filteredNodes.filter(n => n.role === 'host');
  const speakers = filteredNodes.filter(n => n.role === 'speaker');
  const viewers = filteredNodes.filter(n => n.role === 'viewer');
  const isHost = myNode?.role === 'host';

  if (!isParticipantsOpen) return null;

  return (
    <div className="w-full sm:w-80 border-l border-zinc-800 bg-zinc-950 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-200">
            Participants ({allNodes.length})
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
          onClick={() => setParticipantsOpen(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search participants..."
            className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs placeholder:text-zinc-600 focus-visible:ring-zinc-600 pl-8 h-8"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Speaker Requests (host only) */}
          {isHost && speakerRequests.length > 0 && (
            <Section title="Speaker Requests" count={speakerRequests.length} defaultOpen>
              {speakerRequests.map((req) => (
                <div
                  key={req.peerId}
                  className="flex items-center justify-between py-2 px-2 rounded-lg bg-amber-500/5 border border-amber-500/10"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <Hand className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <span className="text-xs text-zinc-300">{req.displayName}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                      onClick={() => {
                        if (engine) {
                          engine.approveSpeaker(req.peerId);
                          removeSpeakerRequest(req.peerId);
                        }
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => {
                        if (engine) {
                          engine.denySpeaker(req.peerId);
                          removeSpeakerRequest(req.peerId);
                        }
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Hosts */}
          {hosts.length > 0 && (
            <Section title="Host" count={hosts.length}>
              {hosts.map((node) => (
                <ParticipantRow key={node.peerId} node={node} isOwn={node.peerId === myNode?.peerId} />
              ))}
            </Section>
          )}

          {/* Speakers */}
          {speakers.length > 0 && (
            <Section title="Speakers" count={speakers.length}>
              {speakers.map((node) => (
                <ParticipantRow key={node.peerId} node={node} isOwn={node.peerId === myNode?.peerId} />
              ))}
            </Section>
          )}

          {/* Viewers */}
          {viewers.length > 0 && (
            <Section title={`Viewers (${viewers.length})`} count={viewers.length}>
              {viewers.slice(0, 50).map((node) => (
                <ParticipantRow key={node.peerId} node={node} isOwn={node.peerId === myNode?.peerId} />
              ))}
              {viewers.length > 50 && (
                <div className="text-center py-1">
                  <span className="text-[10px] text-zinc-600">+{viewers.length - 50} more</span>
                </div>
              )}
            </Section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Section({
  title, count, children, defaultOpen = true,
}: {
  title: string; count: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-1"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
        )}
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {title}
        </span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-zinc-800 text-zinc-500">
          {count}
        </Badge>
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function ParticipantRow({ node, isOwn }: { node: TreeNode; isOwn: boolean }) {
  // Connection quality dot
  const rtt = node.bandwidth?.rttMs ?? 999;
  const qualityColor = rtt < 100 ? 'bg-emerald-400' : rtt < 300 ? 'bg-amber-400' : 'bg-red-400';

  // Get initials
  const initials = node.displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-zinc-800/50 group">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold
          ${node.role === 'host' ? 'bg-emerald-500/20 text-emerald-400' :
            node.role === 'speaker' ? 'bg-amber-500/20 text-amber-400' :
            'bg-zinc-800 text-zinc-400'}`}>
          {node.role === 'host' ? <Crown className="w-3.5 h-3.5" /> : initials}
        </div>
        {/* Connection quality dot */}
        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${qualityColor}`} />
      </div>

      <span className={`text-xs truncate ${isOwn ? 'text-emerald-400 font-medium' : 'text-zinc-300'}`}>
        {node.displayName}
        {isOwn && ' (You)'}
      </span>

      <div className="ml-auto flex items-center gap-1 flex-shrink-0">
        {node.role === 'host' && (
          <Badge className="h-4 px-1 text-[9px] bg-emerald-500/20 text-emerald-400 border-0">
            HOST
          </Badge>
        )}
        {node.role === 'speaker' && (
          <Mic className="w-3 h-3 text-amber-400" />
        )}
      </div>
    </div>
  );
}
