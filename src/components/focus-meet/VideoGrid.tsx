'use client';

import { useRoomStore } from '@/store/room-store';
import { VideoTile } from './VideoTile';
import { Monitor, LayoutGrid, User, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ViewMode } from '@/lib/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useRef } from 'react';

/** Max tiles shown in gallery view on mobile */
const MOBILE_MAX_GALLERY_TILES = 4;
/** Min tile width on mobile (px) */
const MOBILE_MIN_TILE_WIDTH = 140;

export function VideoGrid() {
  const {
    localStream, incomingStream, peerStreams, myNode, nodes,
    audioEnabled, videoEnabled, roomInfo,
    viewMode, setViewMode, screenShare,
  } = useRoomStore();

  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollIndex, setScrollIndex] = useState(0);

  const isSpeaker = myNode?.role === 'host' || myNode?.role === 'speaker';
  const allNodes = Array.from(nodes.values());
  const presenterNodes = allNodes.filter(n => n.role === 'host' || n.role === 'speaker');
  const viewerCount = allNodes.filter(n => n.role === 'viewer').length;

  // Screen share active - it takes over the main area
  if (screenShare.isSharing && screenShare.stream) {
    return (
      <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
        {/* Screen share indicator bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-emerald-600/20 border-b border-emerald-500/30">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-300 text-sm font-medium">
              {screenShare.sharedByName}'s screen
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 text-xs">{nodes.size} participants</span>
          </div>
        </div>

        {/* Main screen share area */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-7xl aspect-video">
            <VideoTile
              stream={screenShare.stream}
              node={screenShare.sharedBy ? (nodes.get(screenShare.sharedBy) ?? null) : null}
              isLocal={screenShare.sharedBy === myNode?.peerId}
              isScreenShare={true}
              audioEnabled={true}
              videoEnabled={true}
            />
          </div>
        </div>

        {/* Thumbnail strip — horizontally scrollable on mobile */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {presenterNodes.filter(n => n.peerId !== screenShare.sharedBy).map(node => (
              <div key={node.peerId} className="flex-shrink-0" style={{ width: isMobile ? MOBILE_MIN_TILE_WIDTH : 128, height: isMobile ? Math.round(MOBILE_MIN_TILE_WIDTH * 0.625) : 80 }}>
                <VideoTile
                  stream={node.peerId === myNode?.peerId ? localStream : (peerStreams.get(node.peerId) ?? incomingStream)}
                  node={node}
                  isLocal={node.peerId === myNode?.peerId}
                  isSmall={true}
                  audioEnabled={audioEnabled}
                  videoEnabled={videoEnabled}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Gallery view - grid of all participants
  if (viewMode === 'gallery') {
    const allParticipants = allNodes;

    // Mobile: limit to max tiles, rest goes to scrollable strip
    const visibleParticipants = isMobile
      ? allParticipants.slice(0, MOBILE_MAX_GALLERY_TILES)
      : allParticipants;
    const overflowParticipants = isMobile
      ? allParticipants.slice(MOBILE_MAX_GALLERY_TILES)
      : [];

    const cols = visibleParticipants.length <= 1 ? 1 : visibleParticipants.length <= 2 ? 2 : visibleParticipants.length <= 4 ? 2 : 3;

    return (
      <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
        {/* View mode toggle */}
        <div className="absolute top-3 right-3 z-10">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 backdrop-blur-sm touch-manipulation"
                  onClick={() => setViewMode('speaker')}
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Speaker view</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex-1 p-3 overflow-auto">
          <div
            className="grid gap-2 h-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridAutoRows: '1fr',
            }}
          >
            {visibleParticipants.map(node => (
              <VideoTile
                key={node.peerId}
                stream={node.peerId === myNode?.peerId ? localStream : (peerStreams.get(node.peerId) ?? incomingStream)}
                node={node}
                isLocal={node.peerId === myNode?.peerId}
                audioEnabled={node.peerId === myNode?.peerId ? audioEnabled : undefined}
                videoEnabled={node.peerId === myNode?.peerId ? videoEnabled : undefined}
              />
            ))}
          </div>
        </div>

        {/* Mobile overflow strip — horizontally scrollable for extra participants */}
        {overflowParticipants.length > 0 && (
          <div className="px-3 pb-2 border-t border-zinc-800/50 pt-2">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none" ref={scrollRef}>
              <span className="text-[10px] text-zinc-500 flex-shrink-0">
                +{overflowParticipants.length} more
              </span>
              {overflowParticipants.map(node => (
                <div
                  key={node.peerId}
                  className="flex-shrink-0"
                  style={{ width: MOBILE_MIN_TILE_WIDTH, height: Math.round(MOBILE_MIN_TILE_WIDTH * 0.625) }}
                >
                  <VideoTile
                    stream={node.peerId === myNode?.peerId ? localStream : (peerStreams.get(node.peerId) ?? incomingStream)}
                    node={node}
                    isLocal={node.peerId === myNode?.peerId}
                    isSmall={true}
                    audioEnabled={node.peerId === myNode?.peerId ? audioEnabled : undefined}
                    videoEnabled={node.peerId === myNode?.peerId ? videoEnabled : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Speaker view - large main video, small thumbnails
  return (
    <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
      {/* View mode toggle */}
      <div className="absolute top-3 right-3 z-10 flex gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 backdrop-blur-sm touch-manipulation"
                onClick={() => setViewMode('gallery')}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Gallery view</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Main video area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="w-full max-w-5xl aspect-video">
          {isSpeaker ? (
            <VideoTile
              stream={localStream}
              node={myNode}
              isLocal={true}
              audioEnabled={audioEnabled}
              videoEnabled={videoEnabled}
            />
          ) : (
            <VideoTile
              stream={incomingStream}
              node={presenterNodes[0] || null}
              isLocal={false}
              audioEnabled={true}
              videoEnabled={true}
            />
          )}
        </div>
      </div>

      {/* Thumbnail strip for speakers — horizontally scrollable on mobile */}
      {presenterNodes.length > 1 && (
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {isSpeaker && (
              <div className="flex-shrink-0" style={{ width: isMobile ? MOBILE_MIN_TILE_WIDTH : 144, height: isMobile ? Math.round(MOBILE_MIN_TILE_WIDTH * 0.625) : 96 }}>
                <VideoTile
                  stream={localStream}
                  node={myNode}
                  isLocal={true}
                  isSmall={true}
                  audioEnabled={audioEnabled}
                  videoEnabled={videoEnabled}
                />
              </div>
            )}
            {presenterNodes
              .filter(n => n.peerId !== myNode?.peerId)
              .map(node => (
                <div key={node.peerId} className="flex-shrink-0" style={{ width: isMobile ? MOBILE_MIN_TILE_WIDTH : 144, height: isMobile ? Math.round(MOBILE_MIN_TILE_WIDTH * 0.625) : 96 }}>
                  <VideoTile
                    stream={peerStreams.get(node.peerId) ?? incomingStream}
                    node={node}
                    isLocal={false}
                    isSmall={true}
                  />
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Viewer count indicator */}
      {viewerCount > 0 && presenterNodes.length <= 1 && (
        <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/80 backdrop-blur-sm">
          <User className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs text-zinc-400">{viewerCount} watching</span>
        </div>
      )}
    </div>
  );
}
