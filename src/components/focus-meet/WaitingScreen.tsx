'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRoomStore } from '@/store/room-store';
import {
  Loader2, Radio, Users, ShieldCheck, Clock,
  Mic, Video, FileText, ArrowLeft, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

export function WaitingScreen() {
  const {
    roomInfo, displayName, connectionStatus,
    waitingForAdmission, wasDeniedFromWaitingRoom,
    reset,
  } = useRoomStore();

  const [dots, setDots] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Animated dots for "waiting" text
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
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
  const isReconnecting =
    connectionStatus === 'reconnecting' || connectionStatus === 'disconnected';

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const handleGoBack = () => {
    reset();
    window.location.hash = '';
  };

  // ──── DENIED STATE ────
  if (wasDeniedFromWaitingRoom) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Background particles */}
        <BackgroundParticles />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="max-w-md w-full text-center space-y-8 relative z-10"
        >
          {/* Denied icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
            className="mx-auto"
          >
            <div className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
          </motion.div>

          {/* Denied message */}
          <div className="space-y-3">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">
              Request Denied
            </h1>
            <p className="text-sm text-zinc-400">
              The host denied your request to join this room.
            </p>
          </div>

          {/* Go Back button */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              onClick={handleGoBack}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  // ──── WAITING STATE ────
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background particles */}
      <BackgroundParticles />

      <div className="max-w-md w-full text-center space-y-8 relative z-10">
        {/* Brand / Webinar Icon */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative mx-auto"
        >
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 border border-blue-500/20 flex items-center justify-center mx-auto">
            <Radio className="w-10 h-10 text-blue-400" />
          </div>
          {/* Pulsing ring */}
          <motion.div
            className="absolute inset-0 w-24 h-24 mx-auto rounded-2xl border-2 border-blue-500/30"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Room Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="space-y-2"
        >
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">
            {roomInfo?.title || 'Focus Meet'}
          </h1>
          {roomInfo?.hostName && (
            <div className="flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-zinc-400">
                Hosted by{' '}
                <span className="text-blue-400 font-medium">{roomInfo.hostName}</span>
              </span>
            </div>
          )}
        </motion.div>

        {/* Waiting Message Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-6 space-y-4"
        >
          {isReconnecting ? (
            <>
              <Loader2 className="w-8 h-8 text-amber-400 mx-auto animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-400">Reconnecting</p>
                <p className="text-xs text-zinc-500">
                  Connection lost. Attempting to reconnect{'.'.repeat(dots)}
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Bouncing dots animation */}
              <div className="flex items-center justify-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-blue-500"
                    animate={{ y: [0, -8, 0] }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-200">
                  Waiting for the host to admit you{'.'.repeat(dots)}
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
        </motion.div>

        {/* Reassurance */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-xs text-blue-400/70"
        >
          You&apos;ll be admitted shortly
        </motion.p>

        {/* Tips while waiting */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="space-y-2"
        >
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">
            While you wait
          </p>
          <div className="grid grid-cols-3 gap-2">
            <TipCard icon={<Mic className="w-4 h-4 text-blue-400/70" />} label="Check audio" />
            <TipCard icon={<Video className="w-4 h-4 text-blue-400/70" />} label="Test camera" />
            <TipCard icon={<FileText className="w-4 h-4 text-blue-400/70" />} label="Prepare notes" />
          </div>
        </motion.div>

        {/* Footer */}
        <p className="text-[10px] text-zinc-700">Focus Meet — by Focuslinks.in</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tip card with icon
// ─────────────────────────────────────────────────────────────

function TipCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-2.5 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Floating background particles for calming ambiance
// ─────────────────────────────────────────────────────────────

function BackgroundParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 4,
        duration: 15 + Math.random() * 20,
        delay: Math.random() * 10,
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-blue-500/[0.04]"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, p.id % 2 === 0 ? 15 : -15, 0],
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Slow gradient shift overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] via-transparent to-blue-700/[0.02]"
        animate={{
          background: [
            'linear-gradient(135deg, rgba(59,130,246,0.02) 0%, transparent 50%, rgba(29,78,216,0.02) 100%)',
            'linear-gradient(225deg, rgba(59,130,246,0.02) 0%, transparent 50%, rgba(29,78,216,0.02) 100%)',
            'linear-gradient(135deg, rgba(59,130,246,0.02) 0%, transparent 50%, rgba(29,78,216,0.02) 100%)',
          ],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
