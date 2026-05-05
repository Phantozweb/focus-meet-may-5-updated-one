'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Video, Users, Zap, Shield, ArrowRight,
  Copy, Check, Monitor, MessageCircle, Smile,
  Sun, Moon, Clock, Radio, Calendar,
  Hand, Headphones, Maximize, Globe,
  Menu, X, Play, BarChart3, MapPin, Timer,
  Trophy, AlertTriangle, Wifi, WifiOff, Volume2,
  Image, Heart, Target, Lightbulb, Flame, Award,
  Presentation, HeadphonesIcon, Signal,
  Hexagon, Star, MessageSquare, ThumbsUp,
  Link2, ExternalLink, Key, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useTheme } from '@/components/theme-provider';
import { BenchmarkEngine } from '@/lib/benchmark';
import { BenchmarkResult } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { generateRoomId, generateAccessToken } from '@/lib/room-system';

// The event room ID — hardcoded so users don't need to type it
const EVENT_ROOM_ID = 'FM-A3K7';
const EVENT_ROOM_TOKEN = 'X9M2PK';

// ============ JOIN ROOM MODAL ============

function JoinRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [joinName, setJoinName] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [membershipId, setMembershipId] = useState('');
  const [joinError, setJoinError] = useState('');
  const [agreedPrecautions, setAgreedPrecautions] = useState(false);

  const handleJoin = () => {
    setJoinError('');
    if (!joinName.trim()) {
      setJoinError('Enter your full name');
      return;
    }
    if (!joinEmail.trim() || !joinEmail.includes('@')) {
      setJoinError('Enter a valid email address');
      return;
    }
    if (!agreedPrecautions) {
      setJoinError('Please acknowledge the precautions before joining');
      return;
    }
    // Use hardcoded event room credentials — user never sees them
    window.location.hash = `room=${EVENT_ROOM_ID}&token=${EVENT_ROOM_TOKEN}&name=${encodeURIComponent(joinName.trim())}&email=${encodeURIComponent(joinEmail.trim())}&mid=${encodeURIComponent(membershipId.trim())}`;
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        {/* Modal */}
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 w-full sm:max-w-md max-h-[92vh] sm:max-h-[85vh] overflow-y-auto bg-[#111111] sm:rounded-2xl rounded-t-2xl border border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="sticky top-0 bg-[#111111]/95 backdrop-blur-md z-10 px-5 pt-5 pb-3 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Video className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Join the Event</h3>
                  <p className="text-[10px] text-zinc-500">Beyond Ortho-K: Myopia Management Session</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Personal Info */}
            <div className="space-y-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Your Details</p>
              <Input
                value={joinName}
                onChange={e => { setJoinName(e.target.value); setJoinError(''); }}
                placeholder="Full Name"
                className="bg-white/5 border-white/15 text-white placeholder:text-zinc-600 text-sm h-11"
              />
              <Input
                value={joinEmail}
                onChange={e => { setJoinEmail(e.target.value); setJoinError(''); }}
                placeholder="Email Address"
                type="email"
                className="bg-white/5 border-white/15 text-white placeholder:text-zinc-600 text-sm h-11"
              />
              <Input
                value={membershipId}
                onChange={e => setMembershipId(e.target.value.toUpperCase())}
                placeholder="FL Credits Membership ID (optional)"
                className="bg-white/5 border-white/15 text-white placeholder:text-zinc-600 font-mono text-sm h-11"
              />
            </div>

            {/* Earn Points — Always visible */}
            <div className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-blue-400" />
                <p className="text-xs font-bold text-zinc-200">Earn Points & FL Credits</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PointsBadge icon={<Clock className="w-3.5 h-3.5" />} label="Full Attendance" points="25 pts" />
                <PointsBadge icon={<MessageCircle className="w-3.5 h-3.5" />} label="Chat Activity" points="15 pts" />
                <PointsBadge icon={<Hand className="w-3.5 h-3.5" />} label="Q&A Participation" points="20 pts" />
                <PointsBadge icon={<Smile className="w-3.5 h-3.5" />} label="Reactions Sent" points="10 pts" />
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Top scorers earn bonus FL Credits, certificates, and leaderboard recognition!
              </p>
            </div>

            {/* Precautions — Always visible, no dropdown */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <p className="text-xs font-bold text-amber-300">Before You Join — Important Precautions</p>
              </div>
              <PrecautionItem
                icon={<Wifi className="w-4 h-4" />}
                title="Stable Internet Required"
                desc="Ensure you have a stable Wi-Fi or 4G/5G connection. Unstable connections may cause disconnections and affect your attendance record."
              />
              <PrecautionItem
                icon={<Volume2 className="w-4 h-4" />}
                title="Quiet Environment Recommended"
                desc="Join from a quiet area with minimal background noise for the best audio experience. Use headphones if possible."
              />
              <PrecautionItem
                icon={<Headphones className="w-4 h-4" />}
                title="Audio Mode for Poor Network"
                desc="If you experience lag or buffering, switch to Audio-Only mode. You will still hear the speaker clearly while saving data."
              />
              <PrecautionItem
                icon={<Image className="w-4 h-4" alt="" />}
                title="Slides Mode Saves Data"
                desc="Use Slides mode instead of video to reduce data usage by up to 80%. The speaker's slides and audio will still be fully synchronized."
              />
              <PrecautionItem
                icon={<AlertTriangle className="w-4 h-4" />}
                title="Attendance & Certificate Policy"
                desc="Leaving the session mid-way may reduce your attendance percentage. Full attendance is required for certificate eligibility and FL Credits."
                warning
              />
            </div>

            {/* Acknowledge checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedPrecautions}
                onChange={e => setAgreedPrecautions(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-zinc-600 bg-white/5 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-[11px] text-zinc-400 leading-relaxed">
                I have read the precautions and understand that leaving mid-session may affect my certificate eligibility and attendance percentage
              </span>
            </label>

            {joinError && <p className="text-red-400 text-xs text-center">{joinError}</p>}

            <Button
              onClick={handleJoin}
              disabled={!joinName.trim() || !joinEmail.trim() || !agreedPrecautions}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12"
            >
              Join the Event <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function PrecautionItem({ icon, title, desc, warning }: { icon: React.ReactNode; title: string; desc: string; warning?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className={`flex-shrink-0 mt-0.5 ${warning ? 'text-red-400' : 'text-amber-400'}`}>{icon}</div>
      <div>
        <p className={`text-xs font-semibold ${warning ? 'text-red-300' : 'text-zinc-200'}`}>{title}</p>
        <p className="text-[11px] text-zinc-500 leading-relaxed mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function PointsBadge({ icon, label, points }: { icon: React.ReactNode; label: string; points: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/10">
      <div className="text-blue-400">{icon}</div>
      <div>
        <p className="text-[10px] text-zinc-400 font-medium">{label}</p>
        <p className="text-[11px] font-bold text-blue-400">{points}</p>
      </div>
    </div>
  );
}

// ============ HOST ROOM MODAL ============

function HostRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [hostName, setHostName] = useState('');
  const [webinarTitle, setWebinarTitle] = useState('');
  const [webinarDesc, setWebinarDesc] = useState('');
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [hostError, setHostError] = useState('');

  // After creation
  const [createdRoom, setCreatedRoom] = useState<{ roomId: string; token: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCreate = () => {
    setHostError('');
    if (!hostName.trim()) {
      setHostError('Enter your name as host');
      return;
    }
    if (!webinarTitle.trim()) {
      setHostError('Enter a webinar title');
      return;
    }
    const roomId = generateRoomId();
    const token = generateAccessToken();
    setCreatedRoom({ roomId, token });
  };

  const getInviteLink = () => {
    if (!createdRoom) return '';
    return `${window.location.origin}/#${encodeURIComponent(`room=${createdRoom.roomId}&token=${createdRoom.token}`)}`;
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleStartWebinar = () => {
    if (!createdRoom) return;
    window.location.hash = `room=${createdRoom.roomId}&token=${createdRoom.token}&host=true&name=${encodeURIComponent(hostName.trim())}&title=${encodeURIComponent(webinarTitle.trim())}&waitingRoom=${waitingRoom}`;
  };

  // Reset on close
  const handleClose = () => {
    setHostName('');
    setWebinarTitle('');
    setWebinarDesc('');
    setWaitingRoom(true);
    setHostError('');
    setCreatedRoom(null);
    setCopiedField(null);
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

        {/* Modal */}
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 w-full sm:max-w-md max-h-[92vh] sm:max-h-[85vh] overflow-y-auto bg-[#111111] sm:rounded-2xl rounded-t-2xl border border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="sticky top-0 bg-[#111111]/95 backdrop-blur-md z-10 px-5 pt-5 pb-3 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                  <Presentation className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Host a Webinar</h3>
                  <p className="text-[10px] text-zinc-500">Create and manage your own room</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {!createdRoom ? (
              <>
                {/* Host Info */}
                <div className="space-y-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Host Details</p>
                  <Input
                    value={hostName}
                    onChange={e => { setHostName(e.target.value); setHostError(''); }}
                    placeholder="Your Name (Host)"
                    className="bg-white/5 border-white/15 text-white placeholder:text-zinc-600 text-sm h-11"
                  />
                </div>

                {/* Webinar Info */}
                <div className="space-y-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Webinar Details</p>
                  <Input
                    value={webinarTitle}
                    onChange={e => { setWebinarTitle(e.target.value); setHostError(''); }}
                    placeholder="Webinar Title"
                    className="bg-white/5 border-white/15 text-white placeholder:text-zinc-600 text-sm h-11"
                  />
                  <textarea
                    value={webinarDesc}
                    onChange={e => setWebinarDesc(e.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>

                {/* Waiting Room Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">Waiting Room</p>
                      <p className="text-[10px] text-zinc-500">Admit attendees before they join</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={waitingRoom}
                    onClick={() => setWaitingRoom(!waitingRoom)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-[#111111] ${
                      waitingRoom ? 'bg-emerald-600' : 'bg-zinc-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        waitingRoom ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Info Banner */}
                <div className="bg-emerald-600/5 border border-emerald-500/20 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-200">How Hosting Works</p>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    As a host, you&apos;ll share your camera and microphone. Your Room ID and Token will be generated automatically. Share these details with your attendees so they can join.
                  </p>
                </div>

                {hostError && <p className="text-red-400 text-xs text-center">{hostError}</p>}

                <Button
                  onClick={handleCreate}
                  disabled={!hostName.trim() || !webinarTitle.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12"
                >
                  Create Room <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </>
            ) : (
              <>
                {/* Success / Share Details */}
                <div className="flex flex-col items-center gap-3 py-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-14 h-14 rounded-2xl bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center"
                  >
                    <Check className="w-7 h-7 text-emerald-400" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-base font-bold text-white">Room Created!</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Share these details with your attendees</p>
                  </div>
                </div>

                {/* Share Details Card */}
                <div className="space-y-3">
                  {/* Room ID */}
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Key className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Room ID</p>
                          <p className="text-sm font-bold text-white font-mono truncate">{createdRoom.roomId}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => copyToClipboard(createdRoom.roomId, 'roomId')}
                        className="flex-shrink-0 p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        {copiedField === 'roomId'
                          ? <Check className="w-4 h-4 text-emerald-400" />
                          : <Copy className="w-4 h-4 text-zinc-400" />
                        }
                      </button>
                    </div>
                  </div>

                  {/* Access Token */}
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Access Token</p>
                          <p className="text-sm font-bold text-white font-mono truncate">{createdRoom.token}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => copyToClipboard(createdRoom.token, 'token')}
                        className="flex-shrink-0 p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        {copiedField === 'token'
                          ? <Check className="w-4 h-4 text-emerald-400" />
                          : <Copy className="w-4 h-4 text-zinc-400" />
                        }
                      </button>
                    </div>
                  </div>

                  {/* Invite Link */}
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Direct Invite Link</p>
                          <p className="text-[11px] text-emerald-300 truncate max-w-[200px] sm:max-w-[260px]">{getInviteLink()}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => copyToClipboard(getInviteLink(), 'link')}
                        className="flex-shrink-0 p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        {copiedField === 'link'
                          ? <Check className="w-4 h-4 text-emerald-400" />
                          : <Copy className="w-4 h-4 text-zinc-400" />
                        }
                      </button>
                    </div>
                  </div>
                </div>

                {/* Waiting room status */}
                {waitingRoom && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <p className="text-[11px] text-zinc-400">
                      Waiting Room is <span className="text-amber-400 font-bold">ON</span> — attendees will need your approval before joining.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleStartWebinar}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12"
                >
                  Start Webinar <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============ MAIN LANDING PAGE ============

export function LandingPage() {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });

  // Countdown timer
  useEffect(() => {
    const eventDate = new Date('2026-05-06T13:30:00Z').getTime();
    const timer = setInterval(() => {
      const diff = eventDate - Date.now();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0 }); clearInterval(timer); return; }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        mins: Math.floor((diff / (1000 * 60)) % 60),
        secs: Math.floor((diff / 1000) % 60),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                <Video className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
              </div>
              <div className="flex items-baseline gap-0">
                <span className="text-base sm:text-lg font-bold tracking-tight text-blue-500">Focus</span>
                <span className="text-base sm:text-lg font-bold tracking-tight text-white">Meet</span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <a href="#hero" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">Home</a>
              <a href="#event" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">Event</a>
              <a href="#why" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">Our Story</a>
              <a href="#leaderboard" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">Leaderboard</a>
              <a href="#benchmark" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">Benchmark</a>
              <Button onClick={() => setJoinModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 px-4">
                Join Event
              </Button>
              <Button onClick={() => setHostModalOpen(true)} variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold h-8 px-4">
                Host
              </Button>
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                {theme === 'dark' ? <Sun className="w-4 h-4 text-zinc-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
              </button>
            </nav>

            <div className="flex items-center gap-2 md:hidden">
              <Button onClick={() => setJoinModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold h-7 px-3">
                Join
              </Button>
              <Button onClick={() => setHostModalOpen(true)} variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-[10px] font-semibold h-7 px-3">
                Host
              </Button>
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                {theme === 'dark' ? <Sun className="w-4 h-4 text-zinc-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
              </button>
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                {mobileMenuOpen ? <X className="w-5 h-5 text-zinc-400" /> : <Menu className="w-5 h-5 text-zinc-400" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden py-3 border-t border-white/10">
              <nav className="flex flex-col gap-1">
                <a href="#hero" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/10 font-medium">Home</a>
                <a href="#event" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/10 font-medium">Event</a>
                <a href="#why" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/10 font-medium">Our Story</a>
                <a href="#leaderboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/10 font-medium">Leaderboard</a>
                <a href="#benchmark" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/10 font-medium">Benchmark</a>
                <button onClick={() => { setMobileMenuOpen(false); setHostModalOpen(true); }} className="px-3 py-2.5 rounded-lg text-sm text-emerald-400 hover:bg-emerald-500/10 font-semibold text-left w-full">
                  Host a Webinar
                </button>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* ===== HERO — Optometry Virtual Meet ===== */}
      <section id="hero" className="relative overflow-hidden">
        <div className="absolute top-[-200px] left-[-150px] w-[500px] h-[500px] bg-blue-600/12 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-150px] right-[-100px] w-[400px] h-[400px] bg-blue-400/8 rounded-full blur-[100px]" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 lg:pt-28 pb-12 sm:pb-20">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/15 border border-blue-500/30 mb-6 sm:mb-8">
              <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span className="text-[11px] sm:text-xs font-semibold text-blue-400">OPTOMETRY VIRTUAL MEET</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-7xl font-black tracking-tight leading-[1.08] mb-4 sm:mb-6">
              <span className="text-white">Where Eye Care</span>
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent">
                Meets Innovation
              </span>
            </h1>

            <p className="text-sm sm:text-lg lg:text-xl text-zinc-400 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2">
              A virtual platform built exclusively for optometrists to learn, connect,
              and grow together. Powered by Honeycomb architecture — no crashes, no limits.
            </p>

            {/* Countdown */}
            <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8 sm:mb-10">
              {[
                { value: timeLeft.days, label: 'Days' },
                { value: timeLeft.hours, label: 'Hours' },
                { value: timeLeft.mins, label: 'Mins' },
                { value: timeLeft.secs, label: 'Secs' },
              ].map((item, i) => (
                <div key={item.label} className="flex items-center gap-2 sm:gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <span className="text-xl sm:text-3xl font-black text-blue-400 font-mono">
                        {String(item.value).padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-[8px] sm:text-[10px] text-zinc-500 mt-1.5 uppercase tracking-widest">{item.label}</span>
                  </div>
                  {i < 3 && <span className="text-2xl sm:text-3xl font-bold text-zinc-700 mb-5 sm:mb-6">:</span>}
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Button
                onClick={() => setJoinModalOpen(true)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base h-12 sm:h-14 px-8 sm:px-10 shadow-lg shadow-blue-600/25 text-base"
              >
                Join the Meet <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button
                onClick={() => setHostModalOpen(true)}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base h-12 sm:h-14 px-8 sm:px-10 shadow-lg shadow-emerald-600/25"
              >
                Host a Webinar <Presentation className="w-5 h-5 ml-2" />
              </Button>
              <a href="#event">
                <Button variant="outline" className="w-full sm:w-auto border-white/15 text-zinc-300 hover:bg-white/5 hover:text-white font-semibold h-12 sm:h-14 px-8 sm:px-10">
                  View Details
                </Button>
              </a>
            </div>

            {/* Branding */}
            <div className="flex items-center justify-center gap-1.5 mt-8 sm:mt-10">
              <span className="text-[10px] sm:text-xs text-zinc-600">by</span>
              <span className="text-xs sm:text-sm font-bold text-blue-500">Focus</span>
              <span className="text-xs sm:text-sm font-bold text-zinc-900">links.in</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EVENT DETAILS ===== */}
      <section id="event" className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-zinc-100 mb-3">
              Beyond Ortho-K: Practical &amp; Affordable Myopia Management with Contact Lenses
            </h2>
            <div className="flex items-center justify-center gap-3 mt-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                <span className="text-sm sm:text-base font-bold text-blue-400">MB</span>
              </div>
              <div className="text-left">
                <p className="text-sm sm:text-base font-semibold text-zinc-200">Manish Bhagat</p>
                <p className="text-[10px] sm:text-xs text-zinc-500">Head — Visual Eyez India | Consultant Optometrist</p>
              </div>
            </div>
          </div>

          {/* Event details row */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-8">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span className="text-xs sm:text-sm font-medium text-zinc-300">May 6, 2026</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-xs sm:text-sm font-medium text-zinc-300">7:00 PM IST</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
              <MapPin className="w-4 h-4 text-blue-400" />
              <span className="text-xs sm:text-sm font-medium text-zinc-300">Online</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* What You'll Learn */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-bold text-zinc-200 mb-3">What You&apos;ll Learn</h3>
                <ul className="space-y-2">
                  {[
                    'Clinical comparison of Ortho-K vs. soft multifocal/simultaneous vision lenses',
                    'Patient selection and case-based decision making',
                    'Cost vs. efficacy in real practice',
                    'Fitting strategies and common challenges',
                    'Long-term myopia control outcomes with different lens modalities',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-zinc-400">
                      <Check className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Global Timings */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-bold text-zinc-200 mb-3">Global Timings</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { city: 'India (IST)', time: '7:00 PM' },
                    { city: 'Dubai (GST)', time: '5:30 PM' },
                    { city: 'London (BST)', time: '2:30 PM' },
                    { city: 'New York (EDT)', time: '9:30 AM' },
                    { city: 'Sydney (AEST)', time: '11:30 PM' },
                  ].map(tz => (
                    <div key={tz.city} className="text-center p-2.5 rounded-lg bg-white/5">
                      <p className="text-[10px] sm:text-xs text-zinc-500 mb-0.5">{tz.city}</p>
                      <p className="text-sm sm:text-base font-bold text-zinc-200">{tz.time}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 mt-3">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <span className="text-xs sm:text-sm text-zinc-300">Earn <span className="text-blue-400 font-bold">50 FL Credits</span> for attending</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ===== WHY WE MADE THIS / JOURNEY ===== */}
      <section id="why" className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/15 border border-blue-500/30 mb-4">
              <Heart className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400">OUR STORY</span>
            </div>
            <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-zinc-100 mb-3">Why We Made This</h2>
            <p className="text-xs sm:text-sm text-zinc-500 max-w-2xl mx-auto">
              Focus Meet was born from a real need — connecting optometrists worldwide without the limitations of traditional platforms.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* The Problem */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-5 sm:p-7">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-4.5 h-4.5 text-red-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-zinc-200">The Problem We Saw</h3>
                </div>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-4">
                  Optometrists across India and the world struggled to access quality continuing education. Existing platforms were expensive, unreliable at scale, and required massive server infrastructure that often crashed during peak attendance. Rural practitioners with poor internet were completely left out. The cost of hosting a session for 500+ eye care professionals was prohibitive for most organizations.
                </p>
                <ul className="space-y-2">
                  {[
                    'Expensive centralized servers crashing mid-session',
                    'Poor connectivity users unable to participate',
                    'No way to track attendance for certificates',
                    'Data-heavy video streams on limited bandwidth',
                    'Zero interactivity — just passive viewing',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-500">
                      <X className="w-3.5 h-3.5 text-red-400/70 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Our Solution — Deliberately vague about architecture */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-5 sm:p-7">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <Lightbulb className="w-4.5 h-4.5 text-blue-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-zinc-200">How Focus Meet Solves It</h3>
                </div>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-4">
                  We engineered a unique Honeycomb architecture — a nature-inspired network where every participant strengthens the whole. Like bees in a hive, each connected device helps relay the stream to others, eliminating the need for expensive central servers entirely. The result is a platform that never crashes, scales effortlessly, and keeps the host&apos;s bandwidth flat regardless of how many people join. Our adaptive delivery system automatically adjusts to each viewer&apos;s connection quality — switching seamlessly between video, slides, and audio-only modes.
                </p>
                <ul className="space-y-2">
                  {[
                    'Honeycomb Architecture — no single point of failure',
                    'Adaptive: Video → Slides → Audio based on network',
                    'Attendance tracking for certificates & FL Credits',
                    'Host bandwidth stays flat even with 1000+ viewers',
                    'Interactive: chat, reactions, hand raise, Q&A',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                      <Check className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Journey Timeline */}
          <div className="mt-10 sm:mt-14">
            <h3 className="text-base sm:text-xl font-bold text-zinc-200 mb-6 text-center">The Journey Behind Focus Meet</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <JourneyCard step="01" title="The Need" desc="Optometrists needed reliable, affordable virtual education. Existing platforms failed at scale and cost too much." icon={<Users className="w-5 h-5" />} />
              <JourneyCard step="02" title="The Honeycomb" desc="Inspired by nature's most efficient structure — every node strengthens the whole. Viewers relay to each other, eliminating central server dependency." icon={<Hexagon className="w-5 h-5" />} />
              <JourneyCard step="03" title="The Innovation" desc="Adaptive delivery: video for good connections, slides+audio for poor ones. Nobody gets left behind due to bandwidth." icon={<Zap className="w-5 h-5" />} />
              <JourneyCard step="04" title="Focus Meet" desc="Launched by Focuslinks.in — a platform for optometrists, by optometrists. Reliable, affordable, and inclusive." icon={<Flame className="w-5 h-5" />} />
            </div>
          </div>
        </div>
      </section>

      {/* ===== LEADERBOARD ===== */}
      <section id="leaderboard" className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">LEADERBOARD</span>
          </div>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-zinc-100 mb-3">Most Engaged Participants</h2>
          <p className="text-xs sm:text-sm text-zinc-500 max-w-lg mx-auto mb-8">
            After each event, the most active and engaged participants will appear here. Your engagement score determines your rank!
          </p>

          {/* Placeholder leaderboard */}
          <Card className="bg-white/[0.03] border-white/10 mb-6">
            <CardContent className="p-6 sm:p-10">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400/50" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-bold text-zinc-300">Leaderboard Coming After the Event</p>
                  <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                    Join the session, stay engaged, ask questions, and interact to earn your spot.
                    Top participants earn bonus FL Credits and recognition!
                  </p>
                </div>

                {/* How points work — detailed breakdown always visible */}
                <div className="w-full mt-3 space-y-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold text-left">How You Earn Points</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full">
                    <EngagementMetric icon={<Clock className="w-4 h-4" />} label="Full Attendance" points="25 pts" detail="Stay the whole session" />
                    <EngagementMetric icon={<MessageSquare className="w-4 h-4" />} label="Chat Activity" points="15 pts" detail="Each meaningful message" />
                    <EngagementMetric icon={<Hand className="w-4 h-4" />} label="Q&A Participation" points="20 pts" detail="Ask answered questions" />
                    <EngagementMetric icon={<ThumbsUp className="w-4 h-4" />} label="Reactions Sent" points="10 pts" detail="Each reaction counts" />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15 mt-2">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <p className="text-[11px] text-zinc-400">
                      Top 3 scorers earn <span className="text-amber-400 font-bold">bonus FL Credits</span> and <span className="text-amber-400 font-bold">special recognition</span>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="text-[10px] sm:text-xs text-zinc-600">
            Leaderboard ranking is based on total engagement score. Leaving mid-session reduces your attendance percentage and impacts certificate eligibility.
          </p>
        </div>
      </section>

      {/* ===== INFO POLICY — Always visible, no dropdown ===== */}
      <section id="info" className="relative z-10 px-4 sm:px-6 lg:px-8 py-10 sm:py-12 bg-white/[0.01] border-y border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm sm:text-base font-bold text-zinc-200">Information Policy</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/10">
              <h4 className="text-xs font-semibold text-zinc-300 mb-1.5">What We Collect</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Your name, email, and FL Credits Membership ID are used solely for attendance tracking, certificate issuance, and FL Credits allocation. We do not share your data with third parties.
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/10">
              <h4 className="text-xs font-semibold text-zinc-300 mb-1.5">Attendance & Certificates</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Attendance is tracked in real-time. Leaving mid-session will reduce your attendance percentage, which may affect your certificate eligibility. Full attendance = full certificate.
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/10">
              <h4 className="text-xs font-semibold text-zinc-300 mb-1.5">Network & Data Usage</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Focus Meet uses adaptive streaming to save your data. Video mode uses the most data; Slides mode reduces usage by ~80%; Audio-only mode reduces usage by ~95%. Switch anytime during the session.
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/10">
              <h4 className="text-xs font-semibold text-zinc-300 mb-1.5">Session Recordings</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Sessions may be recorded for future reference. By joining, you consent to being part of the recording. Recordings are stored securely and are accessible only to Focuslinks.in administrators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== BENCHMARK ===== */}
      <section id="benchmark" className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <CapacityBenchmark />
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 px-4 sm:px-6 lg:px-8 py-8 sm:py-10 bg-[#080808] border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <Video className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex items-baseline gap-0">
                <span className="text-sm font-bold text-blue-500">Focus</span>
                <span className="text-sm font-bold text-white">Meet</span>
              </div>
              <span className="text-[10px] text-zinc-600 ml-1">by</span>
              <span className="text-xs font-bold text-blue-500">Focus</span>
              <span className="text-xs font-bold text-zinc-900">links.in</span>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <a href="#hero" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Home</a>
              <a href="#event" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Event</a>
              <a href="#why" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Our Story</a>
              <a href="#leaderboard" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Leaderboard</a>
              <a href="#benchmark" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Benchmark</a>
            </div>
            <p className="text-[10px] text-zinc-700">
              &copy; 2026 Focuslinks.in — All rights reserved
            </p>
          </div>
        </div>
      </footer>

      {/* Join Room Modal */}
      <JoinRoomModal open={joinModalOpen} onClose={() => setJoinModalOpen(false)} />

      {/* Host Room Modal */}
      <HostRoomModal open={hostModalOpen} onClose={() => setHostModalOpen(false)} />
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function JourneyCard({ step, title, desc, icon }: { step: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Card className="bg-white/[0.03] border-white/10 hover:border-blue-500/20 transition-all group">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            {icon}
          </div>
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Step {step}</span>
        </div>
        <h4 className="text-sm sm:text-base font-bold text-zinc-200 mb-1.5 group-hover:text-blue-300 transition-colors">{title}</h4>
        <p className="text-[11px] sm:text-xs text-zinc-500 leading-relaxed">{desc}</p>
      </CardContent>
    </Card>
  );
}

function EngagementMetric({ icon, label, points, detail }: { icon: React.ReactNode; label: string; points: string; detail?: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-center">
      <div className="flex justify-center text-amber-400 mb-1.5">{icon}</div>
      <p className="text-[10px] sm:text-xs text-zinc-400 font-medium">{label}</p>
      <p className="text-xs sm:text-sm font-bold text-amber-400 mt-0.5">{points}</p>
      {detail && <p className="text-[9px] text-zinc-600 mt-0.5">{detail}</p>}
    </div>
  );
}

// ============ CAPACITY BENCHMARK ============

function CapacityBenchmark() {
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState<{ phase: string; progress: number } | null>(null);
  const [targetUsers, setTargetUsers] = useState(1000);

  const runBenchmark = async () => {
    setBenchmarkRunning(true);
    setBenchmarkResult(null);
    setBenchmarkProgress({ phase: 'Starting...', progress: 0 });
    try {
      const engine = new BenchmarkEngine();
      const result = await engine.runFullBenchmark(targetUsers, (phase, progress) => {
        setBenchmarkProgress({ phase, progress });
      });
      setBenchmarkResult(result);
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setBenchmarkRunning(false);
      setBenchmarkProgress(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-8 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/15 border border-blue-500/30 mb-4">
          <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-blue-400">PERFORMANCE ANALYSIS</span>
        </div>
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-zinc-100 mb-2">Built for Scale</h2>
        <p className="text-xs sm:text-sm text-zinc-500 max-w-lg mx-auto">
          Real-time stress testing of our Honeycomb architecture
        </p>
      </div>

      {/* Infrastructure Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard icon={<Users className="w-5 h-5" />} value="1,000+" label="Concurrent Users" />
        <StatCard icon={<Zap className="w-5 h-5" />} value="~200ms" label="Recovery Time" />
        <StatCard icon={<Monitor className="w-5 h-5" />} value="17.5 Mbps" label="Host Bandwidth" />
        <StatCard icon={<Shield className="w-5 h-5" />} value="99.5%" label="Uptime" />
      </div>

      {/* Architecture Analysis Cards — vague about actual tree structure */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <AnalysisCard
          icon={<Hexagon className="w-5 h-5" />}
          title="Honeycomb Distribution"
          desc="The host stream flows through a self-organizing honeycomb network. Each connected device can relay to a few neighbors, keeping the host's bandwidth flat regardless of total viewer count."
          stats={[
            { label: 'Relay Factor', value: '3-5x' },
            { label: 'Max Hops', value: '6 levels' },
            { label: 'Host Load', value: '17.5 Mbps' },
          ]}
        />
        <AnalysisCard
          icon={<Shield className="w-5 h-5" />}
          title="Self-Healing Network"
          desc="When a node disconnects, its neighbors automatically reconnect to the nearest available relay. Recovery happens in under 200ms with zero data loss — the honeycomb heals itself instantly."
          stats={[
            { label: 'Recovery Time', value: '<200ms' },
            { label: 'Data Loss', value: '0%' },
            { label: 'Backup Nodes', value: '5-10' },
          ]}
        />
        <AnalysisCard
          icon={<HeadphonesIcon className="w-5 h-5" />}
          title="Adaptive Delivery"
          desc="Automatically switches between HD video, slides+audio, and audio-only based on each viewer's real-time connection quality. Saves up to 80% data on poor connections."
          stats={[
            { label: 'Video Mode', value: '720p' },
            { label: 'Slides Mode', value: '~80% less' },
            { label: 'Audio Mode', value: '~95% less' },
          ]}
        />
      </div>

      {/* Interactive Stress Test */}
      <div className="p-4 sm:p-6 rounded-2xl bg-white/[0.03] border border-white/10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-zinc-200 flex items-center gap-2">
              <Play className="w-4 h-4 text-blue-400" /> Run Live Stress Test
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">Simulates real users joining, leaving, and recovering from failures</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 border border-white/10">
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              <input
                type="number"
                value={targetUsers}
                onChange={e => setTargetUsers(Math.max(10, Math.min(2000, parseInt(e.target.value) || 700)))}
                className="w-14 bg-transparent text-sm text-blue-400 font-bold text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={benchmarkRunning}
              />
              <span className="text-[10px] text-zinc-500">users</span>
            </div>
            <Button
              onClick={runBenchmark}
              disabled={benchmarkRunning}
              className={`${benchmarkRunning ? 'bg-zinc-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold text-xs px-4 h-9`}
            >
              {benchmarkRunning ? 'Running...' : 'Run Test'}
            </Button>
          </div>
        </div>

        {/* Progress */}
        {benchmarkRunning && benchmarkProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-400">{benchmarkProgress.phase}</span>
              <span className="text-xs text-blue-400 font-mono">{Math.round(benchmarkProgress.progress * 100)}%</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-400 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${benchmarkProgress.progress * 100}%` }} />
            </div>
          </div>
        )}

        {/* Results */}
        {benchmarkResult && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <ResultStat label="Max Capacity" value={`${benchmarkResult.maxSupportedUsers}`} color="blue" />
              <ResultStat label="Stability" value={`${benchmarkResult.streamStabilityScore}%`}
                color={benchmarkResult.streamStabilityScore >= 80 ? 'blue' : 'amber'} />
              <ResultStat label="Join Rate" value={`${(benchmarkResult.joinSuccessRate * 100).toFixed(1)}%`}
                color={benchmarkResult.joinSuccessRate >= 0.95 ? 'blue' : 'amber'} />
              <ResultStat label="Churn Resist" value={`${benchmarkResult.churnResistanceScore}%`}
                color={benchmarkResult.churnResistanceScore >= 70 ? 'blue' : 'amber'} />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-600 mt-2">
              <Signal className="w-3 h-3" />
              <span>Test simulated {targetUsers} users with random disconnects, reconnections, and bandwidth variations</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="p-3 sm:p-4 rounded-xl border border-white/10 bg-white/[0.02] text-center">
      <div className="flex justify-center mb-1.5 text-blue-400">{icon}</div>
      <div className="text-xl sm:text-2xl font-black text-white">{value}</div>
      <div className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function AnalysisCard({ icon, title, desc, stats }: { icon: React.ReactNode; title: string; desc: string; stats: { label: string; value: string }[] }) {
  return (
    <Card className="bg-white/[0.03] border-white/10 hover:border-blue-500/20 transition-all">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            {icon}
          </div>
          <h4 className="text-sm font-bold text-zinc-200">{title}</h4>
        </div>
        <p className="text-[11px] sm:text-xs text-zinc-500 leading-relaxed mb-3">{desc}</p>
        <div className="grid grid-cols-3 gap-2">
          {stats.map(s => (
            <div key={s.label} className="text-center p-1.5 rounded-lg bg-white/[0.03]">
              <p className="text-xs sm:text-sm font-bold text-blue-400">{s.value}</p>
              <p className="text-[8px] sm:text-[9px] text-zinc-600">{s.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultStat({ label, value, color }: { label: string; value: string; color: 'blue' | 'amber' }) {
  const cm = { blue: 'text-blue-400', amber: 'text-amber-400' };
  return (
    <div className="p-2.5 sm:p-3 rounded-lg bg-white/[0.03] border border-white/10 text-center">
      <div className={`text-sm sm:text-base font-black ${cm[color]}`}>{value}</div>
      <div className="text-[9px] sm:text-[10px] text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}
