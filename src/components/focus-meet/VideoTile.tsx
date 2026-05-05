'use client';

import { useRef, useEffect, useState } from 'react';
import { Mic, MicOff, Monitor, User, Wifi, WifiOff } from 'lucide-react';
import { TreeNode, StreamQuality } from '@/lib/types';

interface VideoTileProps {
  stream: MediaStream | null;
  node: TreeNode | null;
  isLocal?: boolean;
  isSmall?: boolean;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  isScreenShare?: boolean;
  quality?: StreamQuality;
}

export function VideoTile({
  stream,
  node,
  isLocal = false,
  isSmall = false,
  audioEnabled = true,
  videoEnabled = true,
  isScreenShare = false,
  quality,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      if (isLocal) {
        videoRef.current.muted = true;
      }
    }
  }, [stream, isLocal]);

  // Audio activity detection for speaking indicator
  useEffect(() => {
    if (!stream || !audioEnabled || isLocal) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animFrame: number;

    const detect = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setIsSpeaking(avg > 30);
      animFrame = requestAnimationFrame(detect);
    };
    detect();

    return () => {
      cancelAnimationFrame(animFrame);
      audioContext.close();
    };
  }, [stream, audioEnabled, isLocal]);

  const hasVideo = stream && videoEnabled && stream.getVideoTracks().some(t => t.enabled);
  const displayName = node?.displayName || 'Unknown';
  const role = node?.role || 'viewer';

  // Network quality indicator
  const qualityDots = () => {
    const rtt = node?.bandwidth?.rttMs ?? 999;
    const packetLoss = node?.bandwidth?.packetLoss ?? 0;
    let level: 'good' | 'medium' | 'poor' = 'good';
    if (rtt > 300 || packetLoss > 0.1) level = 'poor';
    else if (rtt > 150 || packetLoss > 0.05) level = 'medium';

    const dotColor = level === 'good' ? 'bg-emerald-400' : level === 'medium' ? 'bg-amber-400' : 'bg-red-400';
    const dimColor = 'bg-zinc-700';

    return (
      <div className="flex gap-0.5 items-center">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <div className={`w-1.5 h-1.5 rounded-full ${level === 'poor' ? dimColor : dotColor}`} />
        <div className={`w-1.5 h-1.5 rounded-full ${level === 'good' ? dotColor : dimColor}`} />
      </div>
    );
  };

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-zinc-900 border-2 transition-all duration-300 group
        ${isSmall ? 'w-full h-full min-h-[96px]' : 'w-full h-full min-h-[200px]'}
        ${isSpeaking && !isSmall ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-zinc-800 hover:border-zinc-600'}
        ${isScreenShare ? 'border-emerald-500/50' : ''}`}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? 'mirror-mode' : ''}`}
          style={isLocal && !isScreenShare ? { transform: 'scaleX(-1)' } : {}}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800">
          <div className="flex flex-col items-center gap-3">
            <div className={`rounded-full bg-zinc-700/80 flex items-center justify-center
              ${isSmall ? 'w-10 h-10' : 'w-20 h-20'}`}>
              <User className={`${isSmall ? 'w-5 h-5' : 'w-10 h-10'} text-zinc-400`} />
            </div>
            {!isSmall && (
              <span className="text-zinc-400 text-sm font-medium">{displayName}</span>
            )}
          </div>
        </div>
      )}

      {/* Speaking indicator (animated border glow) */}
      {isSpeaking && !isSmall && (
        <div className="absolute inset-0 rounded-xl border-2 border-emerald-400 pointer-events-none animate-pulse" />
      )}

      {/* Screen share icon overlay */}
      {isScreenShare && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 backdrop-blur-sm">
          <Monitor className="w-3 h-3 text-emerald-400" />
          <span className="text-[9px] text-emerald-400 font-medium">Screen</span>
        </div>
      )}

      {/* "You" badge */}
      {isLocal && (
        <div className="absolute top-2 left-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 text-white backdrop-blur-sm font-medium">
            You
          </span>
        </div>
      )}

      {/* Quality badge overlay */}
      {quality && !isSmall && (
        <div className="absolute top-2 right-2">
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold
            ${quality === 'high' || quality === 'auto' ? 'bg-emerald-500/20 text-emerald-400' :
              quality === 'medium' ? 'bg-amber-500/20 text-amber-400' :
              quality === 'low' ? 'bg-orange-500/20 text-orange-400' :
              'bg-red-500/20 text-red-400'}`}>
            {quality === 'audio-only' ? 'AUDIO' : quality.toUpperCase()}
          </span>
        </div>
      )}

      {/* Bottom overlay with name, role, mic status */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5">
        <div className="flex items-center gap-1.5">
          {/* Role badge */}
          {role === 'host' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold uppercase tracking-wide flex-shrink-0">
              Host
            </span>
          )}
          {role === 'speaker' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold uppercase tracking-wide flex-shrink-0">
              Speaker
            </span>
          )}

          <span className="text-white text-xs font-medium truncate">{displayName}</span>

          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {/* Network quality dots */}
            {!isSmall && qualityDots()}

            {/* Mic indicator */}
            {!audioEnabled && (
              <MicOff className="w-3.5 h-3.5 text-red-400" />
            )}
            {audioEnabled && stream && (
              <Mic className={`w-3.5 h-3.5 ${isSpeaking ? 'text-emerald-400' : 'text-zinc-400'}`} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
