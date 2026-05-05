'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Video, Users, Zap, Shield, ArrowRight,
  Check, Monitor, MessageCircle, Smile,
  Sun, Moon, Clock, Radio, Calendar,
  Hand, Headphones,
  Menu, X, MapPin,
  Trophy, AlertTriangle, Wifi, Volume2,
  Image, Lightbulb, Flame,
  Hexagon, Star, MessageSquare, ThumbsUp,
  Lock, Mail, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/components/theme-provider';
import { motion, AnimatePresence } from 'framer-motion';

// The event room ID — hardcoded so users don't need to type it
const EVENT_ROOM_ID = 'FM-A3K7';
const EVENT_ROOM_TOKEN = 'X9M2PK';

// Access ID mappings for host/speaker/moderator roles
const ACCESS_CODES: Record<string, { role: 'Host' | 'Speaker' | 'Moderator'; color: string }> = {
  'X9M2PK': { role: 'Host', color: 'emerald' },
  'SPK001': { role: 'Speaker', color: 'blue' },
  'MOD001': { role: 'Moderator', color: 'amber' },
};

// ============ JOIN ROOM MODAL ============

function JoinRoomModal({ open, onClose, onSwitchToLogin }: { open: boolean; onClose: () => void; onSwitchToLogin: () => void }) {
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
                  <Eye className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Join as Viewer</h3>
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
              Join as Viewer <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            {/* Switch to Login */}
            <div className="text-center pt-1">
              <button
                onClick={() => { onClose(); onSwitchToLogin(); }}
                className="text-[11px] text-zinc-500 hover:text-emerald-400 transition-colors underline underline-offset-2"
              >
                Have an Access ID? Sign in here
              </button>
            </div>
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

// ============ LOGIN MODAL ============

function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [accessId, setAccessId] = useState('');
  const [loginError, setLoginError] = useState('');

  // Detect role as user types access ID — derived, no effect needed
  const detectedRole = useMemo(() => {
    const code = accessId.toUpperCase().trim();
    if (code.length >= 6 && ACCESS_CODES[code]) {
      return ACCESS_CODES[code];
    }
    return null;
  }, [accessId]);

  const handleSignIn = () => {
    setLoginError('');
    if (!email.trim() || !email.includes('@')) {
      setLoginError('Enter a valid email address');
      return;
    }
    const code = accessId.toUpperCase().trim();
    if (code.length !== 6) {
      setLoginError('Access ID must be 6 characters');
      return;
    }
    const accessInfo = ACCESS_CODES[code];
    if (!accessInfo) {
      setLoginError('Invalid Access ID. Please check and try again.');
      return;
    }
    // Redirect to room with role flag
    const roleParam = accessInfo.role.toLowerCase();
    window.location.hash = `room=${EVENT_ROOM_ID}&token=${EVENT_ROOM_TOKEN}&email=${encodeURIComponent(email.trim())}&role=${roleParam}&accessId=${encodeURIComponent(code)}`;
  };

  const handleClose = () => {
    setEmail('');
    setAccessId('');
    setLoginError('');
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
                  <Lock className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Access Your Event</h3>
                  <p className="text-[10px] text-zinc-500">Sign in for hosts, speakers & moderators</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Email Input */}
            <div className="space-y-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Your Email</p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <Input
                  value={email}
                  onChange={e => { setEmail(e.target.value); setLoginError(''); }}
                  placeholder="your@email.com"
                  type="email"
                  className="bg-white/5 border-white/15 text-white placeholder:text-zinc-600 text-sm h-11 pl-10"
                />
              </div>
            </div>

            {/* Access ID Input */}
            <div className="space-y-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Access ID</p>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <Input
                  value={accessId}
                  onChange={e => { setAccessId(e.target.value.toUpperCase()); setLoginError(''); }}
                  placeholder="e.g. X9M2PK"
                  maxLength={6}
                  className="bg-white/5 border-white/15 text-white placeholder:text-zinc-600 font-mono text-sm h-11 pl-10 tracking-widest"
                />
              </div>
              <p className="text-[10px] text-zinc-600">Enter the 6-character code provided to you</p>
            </div>

            {/* Role Indicator */}
            <AnimatePresence mode="wait">
              {detectedRole && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className={`p-3 rounded-xl border flex items-center gap-3 ${
                    detectedRole.color === 'emerald'
                      ? 'bg-emerald-600/10 border-emerald-500/30'
                      : detectedRole.color === 'blue'
                        ? 'bg-blue-600/10 border-blue-500/30'
                        : 'bg-amber-600/10 border-amber-500/30'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    detectedRole.color === 'emerald'
                      ? 'bg-emerald-600/20'
                      : detectedRole.color === 'blue'
                        ? 'bg-blue-600/20'
                        : 'bg-amber-600/20'
                  }`}>
                    {detectedRole.role === 'Host' && <Video className="w-4.5 h-4.5 text-emerald-400" />}
                    {detectedRole.role === 'Speaker' && <Monitor className="w-4.5 h-4.5 text-blue-400" />}
                    {detectedRole.role === 'Moderator' && <Shield className="w-4.5 h-4.5 text-amber-400" />}
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">Access granted as</p>
                    <Badge
                      className={`mt-0.5 ${
                        detectedRole.color === 'emerald'
                          ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30'
                          : detectedRole.color === 'blue'
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                            : 'bg-amber-600/20 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {detectedRole.role}
                    </Badge>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Info Banner */}
            <div className="bg-emerald-600/5 border border-emerald-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-emerald-400" />
                <p className="text-xs font-bold text-zinc-200">Access Levels</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Video className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] text-zinc-400"><span className="text-emerald-400 font-semibold">Host</span> — Full control, manage room & attendees</span>
                </div>
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[11px] text-zinc-400"><span className="text-blue-400 font-semibold">Speaker</span> — Present with camera & mic access</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] text-zinc-400"><span className="text-amber-400 font-semibold">Moderator</span> — Manage chat, Q&A & attendees</span>
                </div>
              </div>
            </div>

            {loginError && <p className="text-red-400 text-xs text-center">{loginError}</p>}

            <Button
              onClick={handleSignIn}
              disabled={!email.trim() || accessId.trim().length !== 6}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12"
            >
              Sign In <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============ MAIN LANDING PAGE ============

export function LandingPage({ showLoginOnMount = false }: { showLoginOnMount?: boolean } = {}) {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(showLoginOnMount);
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
              <a href="#upcoming" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">Upcoming</a>
              <a href="#leaderboard" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">Leaderboard</a>
              <Button onClick={() => setJoinModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 px-4">
                Join Event
              </Button>
              <Button onClick={() => setLoginModalOpen(true)} variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold h-8 px-4">
                Sign In
              </Button>
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                {theme === 'dark' ? <Sun className="w-4 h-4 text-zinc-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
              </button>
            </nav>

            <div className="flex items-center gap-2 md:hidden">
              <Button onClick={() => setJoinModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold h-7 px-3">
                Join
              </Button>
              <Button onClick={() => setLoginModalOpen(true)} variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-[10px] font-semibold h-7 px-3">
                Sign In
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
                <a href="#upcoming" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/10 font-medium">Upcoming</a>
                <a href="#leaderboard" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:bg-white/10 font-medium">Leaderboard</a>
                <button onClick={() => { setMobileMenuOpen(false); setLoginModalOpen(true); }} className="px-3 py-2.5 rounded-lg text-sm text-emerald-400 hover:bg-emerald-500/10 font-semibold text-left w-full">
                  Sign In
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
              A seamless virtual platform that adapts to every connection, ensuring no one misses a moment.
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
                onClick={() => setLoginModalOpen(true)}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base h-12 sm:h-14 px-8 sm:px-10 shadow-lg shadow-emerald-600/25"
              >
                Host a Webinar <Lock className="w-5 h-5 ml-2" />
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

      {/* ===== UPCOMING EVENTS ===== */}
      <section id="upcoming" className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/15 border border-blue-500/30 mb-4">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400">UPCOMING EVENTS</span>
            </div>
            <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-zinc-100 mb-3">Upcoming Events</h2>
            <p className="text-xs sm:text-sm text-zinc-500 max-w-lg mx-auto">
              Register now to secure your spot. Each session offers FL Credits and certificates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Event 1 — Beyond Ortho-K (current) */}
            <EventCard
              title="Beyond Ortho-K: Myopia Management with Contact Lenses"
              speaker="Manish Bhagat"
              speakerRole="Head — Visual Eyez India"
              speakerInitials="MB"
              date="May 6, 2026"
              time="7:00 PM IST"
              isLive
            />

            {/* Event 2 — Placeholder */}
            <EventCard
              title="Pediatric Vision Screening: Early Detection Strategies"
              speaker="Dr. Priya Sharma"
              speakerRole="Pediatric Optometrist, AIIMS"
              speakerInitials="PS"
              date="May 20, 2026"
              time="6:30 PM IST"
            />

            {/* Event 3 — Placeholder */}
            <EventCard
              title="Digital Eye Strain: Managing Screen-Related Vision Issues"
              speaker="Dr. Arjun Mehta"
              speakerRole="Clinical Director, EyeCare Plus"
              speakerInitials="AM"
              date="June 3, 2026"
              time="7:00 PM IST"
            />
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

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 px-4 sm:px-6 lg:px-8 py-8 sm:py-10 bg-[#080808] border-t border-white/5 mt-auto">
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
              <a href="#upcoming" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Upcoming</a>
              <a href="#leaderboard" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Leaderboard</a>
              <span className="text-[11px] text-zinc-600">|</span>
              <a href="#" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Help</a>
              <a href="#" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Privacy</a>
              <a href="#" className="text-[11px] text-zinc-500 hover:text-white transition-colors">Terms</a>
            </div>
            <p className="text-[10px] text-zinc-700">
              &copy; 2026 Focuslinks.in — All rights reserved
            </p>
          </div>
        </div>
      </footer>

      {/* Join Room Modal */}
      <JoinRoomModal open={joinModalOpen} onClose={() => setJoinModalOpen(false)} onSwitchToLogin={() => setLoginModalOpen(true)} />

      {/* Login Modal */}
      <LoginModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function EventCard({
  title,
  speaker,
  speakerRole,
  speakerInitials,
  date,
  time,
  isLive,
}: {
  title: string;
  speaker: string;
  speakerRole: string;
  speakerInitials: string;
  date: string;
  time: string;
  isLive?: boolean;
}) {
  return (
    <Card className="bg-white/[0.03] border-white/10 hover:border-blue-500/20 transition-all group">
      <CardContent className="p-4 sm:p-5">
        {/* Live badge */}
        {isLive && (
          <div className="flex items-center gap-1.5 mb-3">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-400 uppercase">Next Up</span>
            </div>
          </div>
        )}

        <h4 className="text-sm sm:text-base font-bold text-zinc-200 mb-3 group-hover:text-blue-300 transition-colors leading-snug">
          {title}
        </h4>

        {/* Speaker info */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-blue-400">{speakerInitials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-300 truncate">{speaker}</p>
            <p className="text-[9px] text-zinc-500 truncate">{speakerRole}</p>
          </div>
        </div>

        {/* Date & time */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
            <Calendar className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] font-medium text-zinc-400">{date}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] font-medium text-zinc-400">{time}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold h-8"
          >
            Join
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-[11px] font-semibold h-8"
          >
            Sign In
          </Button>
        </div>
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
