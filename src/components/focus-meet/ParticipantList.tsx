'use client';

import { useRoomStore } from '@/store/room-store';
import { TreeNode } from '@/lib/types';
import {
  Crown, Mic, MicOff, Hand, Check, X, User,
  ChevronDown, ChevronRight, Search, Wifi, WifiOff,
  MoreVertical, UserMinus, VolumeX, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';
import { toast } from 'sonner';

export function ParticipantList({ standalone = false }: { standalone?: boolean } = {}) {
  const {
    nodes, myNode, speakerRequests, engine, removeSpeakerRequest,
    isParticipantsOpen, setParticipantsOpen, isHost, isCoHost, handRaises,
  } = useRoomStore();
  const [search, setSearch] = useState('');
  const [removeTarget, setRemoveTarget] = useState<{ peerId: string; name: string } | null>(null);

  const canModerate = isHost || isCoHost;

  const allNodes = Array.from(nodes.values());
  const filteredNodes = search.trim()
    ? allNodes.filter(n => n.displayName.toLowerCase().includes(search.toLowerCase()))
    : allNodes;

  const hosts = filteredNodes.filter(n => n.role === 'host');
  const coHosts = filteredNodes.filter(n => n.role === 'co-host');
  const speakers = filteredNodes.filter(n => n.role === 'speaker');
  const viewers = filteredNodes.filter(n => n.role === 'viewer');

  const handlePromoteCoHost = (peerId: string) => {
    if (engine) {
      engine.promoteToCoHost(peerId);
      toast.success('Promoted to Co-Host');
    }
  };

  const handleDemoteCoHost = (peerId: string) => {
    if (engine) {
      engine.demoteCoHost(peerId);
      toast.info('Demoted from Co-Host');
    }
  };

  const handleMute = (peerId: string) => {
    if (engine) {
      engine.muteParticipant(peerId);
      toast.info('Participant muted');
    }
  };

  const handleRemove = (peerId: string) => {
    if (engine) {
      engine.removeParticipant(peerId);
      toast.info('Participant removed');
    }
    setRemoveTarget(null);
  };

  const handleLowerHand = (peerId: string) => {
    // Host/co-host lowering a participant's raised hand.
    // engine.lowerParticipantHand() broadcasts a hand-lower signal through
    // the P2P tree so all nodes (including the target) update their state.
    // The onHandRaiseUpdate callback will remove the hand from the store.
    if (engine) {
      engine.lowerParticipantHand(peerId);
      // Also remove locally in case the callback hasn't fired yet
      useRoomStore.getState().removeHandRaise(peerId);
      toast.info('Hand lowered');
    }
  };

  const handleApproveSpeaker = (peerId: string) => {
    if (engine) {
      engine.approveSpeaker(peerId);
      removeSpeakerRequest(peerId);
      useRoomStore.getState().removeHandRaise(peerId);
      toast.success('Approved to speak');
    }
  };

  const isHandRaised = (peerId: string) =>
    handRaises.some(h => h.peerId === peerId && h.isRaised);

  if (!standalone && !isParticipantsOpen) return null;

  return (
    <div className={`w-full bg-zinc-950 flex flex-col h-full ${standalone ? '' : 'sm:w-80 border-l border-zinc-800'}`}>
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
          {/* Speaker Requests (host/co-host only) */}
          {canModerate && speakerRequests.length > 0 && (
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
                <ParticipantRow
                  key={node.peerId}
                  node={node}
                  isOwn={node.peerId === myNode?.peerId}
                  canModerate={canModerate}
                  isHostUser={isHost}
                  isHandRaised={isHandRaised(node.peerId)}
                  onPromoteCoHost={handlePromoteCoHost}
                  onDemoteCoHost={handleDemoteCoHost}
                  onMute={handleMute}
                  onRemove={setRemoveTarget}
                  onApproveSpeaker={handleApproveSpeaker}
                  onLowerHand={handleLowerHand}
                />
              ))}
            </Section>
          )}

          {/* Co-Hosts */}
          {coHosts.length > 0 && (
            <Section title="Co-Hosts" count={coHosts.length}>
              {coHosts.map((node) => (
                <ParticipantRow
                  key={node.peerId}
                  node={node}
                  isOwn={node.peerId === myNode?.peerId}
                  canModerate={canModerate}
                  isHostUser={isHost}
                  isHandRaised={isHandRaised(node.peerId)}
                  onPromoteCoHost={handlePromoteCoHost}
                  onDemoteCoHost={handleDemoteCoHost}
                  onMute={handleMute}
                  onRemove={setRemoveTarget}
                  onApproveSpeaker={handleApproveSpeaker}
                  onLowerHand={handleLowerHand}
                />
              ))}
            </Section>
          )}

          {/* Speakers */}
          {speakers.length > 0 && (
            <Section title="Speakers" count={speakers.length}>
              {speakers.map((node) => (
                <ParticipantRow
                  key={node.peerId}
                  node={node}
                  isOwn={node.peerId === myNode?.peerId}
                  canModerate={canModerate}
                  isHostUser={isHost}
                  isHandRaised={isHandRaised(node.peerId)}
                  onPromoteCoHost={handlePromoteCoHost}
                  onDemoteCoHost={handleDemoteCoHost}
                  onMute={handleMute}
                  onRemove={setRemoveTarget}
                  onApproveSpeaker={handleApproveSpeaker}
                  onLowerHand={handleLowerHand}
                />
              ))}
            </Section>
          )}

          {/* Viewers */}
          {viewers.length > 0 && (
            <Section title={`Viewers (${viewers.length})`} count={viewers.length}>
              {viewers.slice(0, 50).map((node) => (
                <ParticipantRow
                  key={node.peerId}
                  node={node}
                  isOwn={node.peerId === myNode?.peerId}
                  canModerate={canModerate}
                  isHostUser={isHost}
                  isHandRaised={isHandRaised(node.peerId)}
                  onPromoteCoHost={handlePromoteCoHost}
                  onDemoteCoHost={handleDemoteCoHost}
                  onMute={handleMute}
                  onRemove={setRemoveTarget}
                  onApproveSpeaker={handleApproveSpeaker}
                  onLowerHand={handleLowerHand}
                />
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

      {/* Remove confirmation dialog */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Remove Participant</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to remove <span className="text-zinc-200 font-medium">{removeTarget?.name}</span> from the meeting? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => { if (removeTarget) handleRemove(removeTarget.peerId); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

interface ParticipantRowProps {
  node: TreeNode;
  isOwn: boolean;
  canModerate: boolean;
  isHostUser: boolean;
  isHandRaised: boolean;
  onPromoteCoHost: (peerId: string) => void;
  onDemoteCoHost: (peerId: string) => void;
  onMute: (peerId: string) => void;
  onRemove: (target: { peerId: string; name: string }) => void;
  onApproveSpeaker: (peerId: string) => void;
  onLowerHand: (peerId: string) => void;
}

function ParticipantRow({
  node, isOwn, canModerate, isHostUser, isHandRaised,
  onPromoteCoHost, onDemoteCoHost, onMute, onRemove, onApproveSpeaker, onLowerHand,
}: ParticipantRowProps) {
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

  // Don't show actions on yourself
  const showActions = canModerate && !isOwn;
  // Only host can promote/demote co-hosts
  const canManageCoHost = isHostUser && !isOwn;

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-zinc-800/50 group">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold
          ${node.role === 'host' ? 'bg-emerald-500/20 text-emerald-400' :
            node.role === 'co-host' ? 'bg-violet-500/20 text-violet-400' :
            node.role === 'speaker' ? 'bg-amber-500/20 text-amber-400' :
            'bg-zinc-800 text-zinc-400'}`}>
          {node.role === 'host' ? <Crown className="w-3.5 h-3.5" /> :
           node.role === 'co-host' ? <Shield className="w-3 h-3" /> :
           initials}
        </div>
        {/* Connection quality dot */}
        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${qualityColor}`} />
      </div>

      <span className={`text-xs truncate flex-1 min-w-0 ${isOwn ? 'text-emerald-400 font-medium' : 'text-zinc-300'}`}>
        {node.displayName}
        {isOwn && ' (You)'}
      </span>

      {/* Hand raise indicator + Approve button */}
      {isHandRaised && (
        <>
          <Hand className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          {canModerate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              onClick={() => onApproveSpeaker(node.peerId)}
              title="Approve to speak"
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          )}
        </>
      )}

      <div className="flex items-center gap-1 flex-shrink-0">
        {node.role === 'host' && (
          <Badge className="h-4 px-1 text-[9px] bg-emerald-500/20 text-emerald-400 border-0">
            HOST
          </Badge>
        )}
        {node.role === 'co-host' && (
          <Badge className="h-4 px-1 text-[9px] bg-violet-500/20 text-violet-400 border-0 flex items-center gap-0.5">
            <Crown className="w-2.5 h-2.5" />
            CO-HOST
          </Badge>
        )}
        {node.role === 'speaker' && (
          <Mic className="w-3 h-3 text-amber-400" />
        )}

        {/* Action menu for host/co-host */}
        {showActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-zinc-900 border-zinc-800 w-48"
            >
              {/* Promote to Co-Host (only for viewers/speakers, only host can do this) */}
              {canManageCoHost && (node.role === 'viewer' || node.role === 'speaker') && (
                <DropdownMenuItem
                  className="text-zinc-300 focus:text-zinc-100 focus:bg-zinc-800 text-xs"
                  onClick={() => onPromoteCoHost(node.peerId)}
                >
                  <Shield className="w-3.5 h-3.5 mr-2 text-violet-400" />
                  Promote to Co-Host
                </DropdownMenuItem>
              )}

              {/* Demote from Co-Host (only for co-hosts, only host can do this) */}
              {canManageCoHost && node.role === 'co-host' && (
                <DropdownMenuItem
                  className="text-zinc-300 focus:text-zinc-100 focus:bg-zinc-800 text-xs"
                  onClick={() => onDemoteCoHost(node.peerId)}
                >
                  <UserMinus className="w-3.5 h-3.5 mr-2 text-zinc-400" />
                  Demote from Co-Host
                </DropdownMenuItem>
              )}

              {/* Lower Hand (only if hand is raised) */}
              {isHandRaised && (
                <DropdownMenuItem
                  className="text-zinc-300 focus:text-zinc-100 focus:bg-zinc-800 text-xs"
                  onClick={() => onLowerHand(node.peerId)}
                >
                  <Hand className="w-3.5 h-3.5 mr-2 text-amber-400" />
                  Lower Hand
                </DropdownMenuItem>
              )}

              {/* Approve to Speak (only if hand is raised) */}
              {isHandRaised && canModerate && (
                <DropdownMenuItem
                  className="text-emerald-400 focus:text-emerald-300 focus:bg-emerald-500/10 text-xs"
                  onClick={() => onApproveSpeaker(node.peerId)}
                >
                  <Check className="w-3.5 h-3.5 mr-2" />
                  Approve to Speak
                </DropdownMenuItem>
              )}

              {/* Mute */}
              <DropdownMenuItem
                className="text-zinc-300 focus:text-zinc-100 focus:bg-zinc-800 text-xs"
                onClick={() => onMute(node.peerId)}
              >
                <VolumeX className="w-3.5 h-3.5 mr-2 text-zinc-400" />
                Mute
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-zinc-800" />

              {/* Remove/Kick — destructive */}
              <DropdownMenuItem
                variant="destructive"
                className="text-xs"
                onClick={() => onRemove({ peerId: node.peerId, name: node.displayName })}
              >
                <X className="w-3.5 h-3.5 mr-2" />
                Remove from Meeting
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
