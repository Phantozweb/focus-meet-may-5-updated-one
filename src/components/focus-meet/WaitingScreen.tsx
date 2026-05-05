'use client';

import { useState, useEffect } from 'react';
import { useRoomStore } from '@/store/room-store';
import {
  Loader2, Radio, Users, ShieldCheck, Clock,
} from 'lucide-react';

interface WaitingScreenProps {
  /** Called when the attendee has been admitted and should proceed */
  onAdmitted?: () => void;
}

export function WaitingScreen({ onAdmitted }: WaitingScreenProps) {
  const { roomInfo, displayName, connectionStatus } = useRoomStore();
  const [dots, setDots] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Animated dots for "waiting" text
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Elapsed time counter
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // If connection is lost, show reconnecting state
  const isReconnecting = connectionStatus === 'reconnecting' || connectionStatus === 'disconnected';

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Brand / Webinar Icon */}
        <div className="relative mx-auto">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 border border-blue-500/20 flex items-center justify-center mx-auto">
            <Radio className="w-10 h-10 text-blue-400" />
          </div>
          {/* Pulsing ring */}
          <div className="absolute inset-0 w-24 h-24 mx-auto rounded-2xl border-2 border-blue-500/30 animate-ping" style={{ animationDuration: '2s' }} />
        </div>

        {/* Webinar Title */}
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">
            {roomInfo?.title || 'Focus Meet'}
          </h1>
          {roomInfo?.hostName && (
            <div className="flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-zinc-400">
                Hosted by <span className="text-blue-400 font-medium">{roomInfo.hostName}</span>
              </span>
            </div>
          )}
        </div>

        {/* Waiting Message */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 space-y-4">
          {isReconnecting ? (
            <>
              <Loader2 className="w-8 h-8 text-amber-400 mx-auto animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-400">Reconnecting</p>
                <p className="text-xs text-zinc-500">
                  Connection lost. Attempting to reconnect{'.' .repeat(dots)}
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Loading animation */}
              <div className="flex items-center justify-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
                  />
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-200">
                  The host will let you in soon{'.' .repeat(dots)}
                </p>
                <p className="text-xs text-zinc-500">
                  You&apos;re in the waiting room
                </p>
              </div>
            </>
          )}

          {/* Attendee info */}
          <div className="pt-3 border-t border-zinc-800">
            <div className="flex items-center justify-center gap-3 text-xs text-zinc-500">
              <div className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>{displayName || 'Guest'}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Waiting {formatElapsed(elapsed)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">
            While you wait
          </p>
          <div className="grid grid-cols-3 gap-2">
            <TipCard icon="🎧" label="Check audio" />
            <TipCard icon="📷" label="Test camera" />
            <TipCard icon="📝" label="Prepare notes" />
          </div>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-zinc-700">
          Focus Meet — by Focuslinks.in
        </p>
      </div>
    </div>
  );
}

function TipCard({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-2.5 text-center">
      <span className="text-lg">{icon}</span>
      <p className="text-[10px] text-zinc-500 mt-1">{label}</p>
    </div>
  );
}
