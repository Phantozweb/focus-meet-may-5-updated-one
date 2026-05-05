'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRoomStore } from '@/store/room-store';
import { FakeUser, FakeUserPersona, FAKE_USER_PERSONAS, ReactionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  UserPlus, UserMinus, Users, Send, Smile, Hand, Bot, Zap, X, Sparkles, MessageCircle, Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const REACTION_EMOJIS: { type: ReactionType; emoji: string }[] = [
  { type: 'thumbsup', emoji: '👍' },
  { type: 'clap', emoji: '👏' },
  { type: 'heart', emoji: '❤️' },
  { type: 'laugh', emoji: '😂' },
  { type: 'fire', emoji: '🔥' },
  { type: 'wave', emoji: '👋' },
];

export function FakeUsersPanel() {
  const { engine, fakeUsers, addFakeUser, removeFakeUser, updateFakeUser, nodes } = useRoomStore();
  const [newUserName, setNewUserName] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<FakeUserPersona>('enthusiastic-student');
  const [autoTimers, setAutoTimers] = useState<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const timerRef = useRef(autoTimers);
  useEffect(() => { timerRef.current = autoTimers; }, [autoTimers]);

  const handleCreateFakeUser = useCallback(() => {
    if (!engine) return;
    if (!newUserName.trim()) {
      toast.error('Enter a name for the fake user');
      return;
    }
    const fakeId = engine.createFakeUser(newUserName.trim(), selectedPersona);
    if (fakeId) {
      // Find the peer ID from the engine's nodes
      const fakePeerId = engine.getFakeUserPeerIds().pop() || '';
      const persona = FAKE_USER_PERSONAS.find(p => p.id === selectedPersona);
      addFakeUser({
        id: fakeId,
        peerId: fakePeerId,
        displayName: newUserName.trim(),
        persona: selectedPersona,
        isActive: true,
        joinedAt: Date.now(),
        autoBehavior: false,
        lastActivityAt: Date.now(),
      });
      setNewUserName('');
      toast.success(`${newUserName.trim()} joined as ${persona?.label || selectedPersona}`);
    }
  }, [engine, newUserName, selectedPersona, addFakeUser]);

  const handleRemoveFakeUser = useCallback((fakeUser: FakeUser) => {
    if (!engine) return;
    engine.removeFakeUser(fakeUser.peerId);
    removeFakeUser(fakeUser.id);
    // Stop auto timer if running
    const timer = timerRef.current.get(fakeUser.id);
    if (timer) {
      clearInterval(timer);
      const newTimers = new Map(timerRef.current);
      newTimers.delete(fakeUser.id);
      setAutoTimers(newTimers);
    }
    toast.info(`${fakeUser.displayName} left the webinar`);
  }, [engine, removeFakeUser]);

  const handleToggleAutoBehavior = useCallback((fakeUser: FakeUser) => {
    const newAuto = !fakeUser.autoBehavior;
    updateFakeUser(fakeUser.id, { autoBehavior: newAuto });

    if (newAuto && engine) {
      // Start auto behavior timer
      const persona = FAKE_USER_PERSONAS.find(p => p.id === fakeUser.persona);
      const chatInterval = persona?.chatFrequency === 'high' ? 8000 : persona?.chatFrequency === 'medium' ? 15000 : 25000;
      const reactInterval = persona?.reactionFrequency === 'high' ? 5000 : persona?.reactionFrequency === 'medium' ? 10000 : 18000;

      const timer = setInterval(() => {
        const action = Math.random();
        if (action < 0.4 && persona) {
          // Send a chat message
          const messages = persona.sampleMessages;
          const msg = messages[Math.floor(Math.random() * messages.length)];
          engine.sendFakeChatMessage(fakeUser.peerId, msg);
        } else if (action < 0.8) {
          // Send a reaction
          const reaction = REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
          engine.sendFakeReaction(fakeUser.peerId, reaction.type);
        }
        updateFakeUser(fakeUser.id, { lastActivityAt: Date.now() });
      }, Math.min(chatInterval, reactInterval));

      const newTimers = new Map(timerRef.current);
      newTimers.set(fakeUser.id, timer);
      setAutoTimers(newTimers);
      toast.success(`Auto behavior enabled for ${fakeUser.displayName}`);
    } else {
      // Stop auto behavior timer
      const timer = timerRef.current.get(fakeUser.id);
      if (timer) {
        clearInterval(timer);
        const newTimers = new Map(timerRef.current);
        newTimers.delete(fakeUser.id);
        setAutoTimers(newTimers);
      }
      toast.info(`Auto behavior disabled for ${fakeUser.displayName}`);
    }
  }, [engine, updateFakeUser]);

  const handleFakeChat = useCallback((fakeUser: FakeUser) => {
    if (!engine) return;
    const persona = FAKE_USER_PERSONAS.find(p => p.id === fakeUser.persona);
    const messages = persona?.sampleMessages || ['Great session!'];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    engine.sendFakeChatMessage(fakeUser.peerId, msg);
    updateFakeUser(fakeUser.id, { lastActivityAt: Date.now() });
    toast.success(`Sent chat as ${fakeUser.displayName}`);
  }, [engine, updateFakeUser]);

  const handleFakeReaction = useCallback((fakeUser: FakeUser, type: ReactionType) => {
    if (!engine) return;
    engine.sendFakeReaction(fakeUser.peerId, type);
    updateFakeUser(fakeUser.id, { lastActivityAt: Date.now() });
  }, [engine, updateFakeUser]);

  const handleFakeHand = useCallback((fakeUser: FakeUser) => {
    if (!engine) return;
    engine.impersonateHandRaise(fakeUser.peerId, true);
    // Auto-lower after 5 seconds
    setTimeout(() => {
      engine.impersonateHandRaise(fakeUser.peerId, false);
    }, 5000);
    toast.success(`${fakeUser.displayName} raised their hand`);
  }, [engine]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timerRef.current.forEach(timer => clearInterval(timer));
    };
  }, []);

  // Generate random name suggestion
  const suggestName = () => {
    const firstNames = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Quinn', 'Avery', 'Blake', 'Cameron', 'Drew', 'Jamie', 'Kennedy', 'Logan', 'Parker', 'Reese', 'Sage', 'Skyler', 'Harper'];
    const lastNames = ['Smith', 'Patel', 'Chen', 'Kim', 'Garcia', 'Muller', 'Singh', 'Tanaka', 'Silva', 'Brown', 'Wilson', 'Zhang', 'Shah', 'Lee', 'Anderson'];
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-zinc-200">Fake Users</span>
            <Badge className="h-5 px-1.5 text-[9px] bg-violet-500/20 text-violet-400 border-0">
              {fakeUsers.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Badge className="h-5 px-1.5 text-[8px] bg-zinc-800 text-zinc-500 border-0">
              Hidden Feature
            </Badge>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">Add virtual participants to simulate a larger audience</p>
      </div>

      {/* Create fake user form */}
      <div className="px-4 py-3 border-b border-zinc-800 space-y-2 flex-shrink-0">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              value={newUserName}
              onChange={e => setNewUserName(e.target.value)}
              placeholder="Display name"
              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm h-9 pr-9"
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFakeUser(); }}
            />
            <button
              onClick={() => setNewUserName(suggestName())}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-violet-400 transition-colors"
              title="Suggest a random name"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button
            onClick={handleCreateFakeUser}
            disabled={!newUserName.trim() || !engine}
            className="bg-violet-600 hover:bg-violet-700 text-white h-9 px-3"
          >
            <UserPlus className="w-4 h-4" />
          </Button>
        </div>

        {/* Persona selector */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {FAKE_USER_PERSONAS.map(persona => (
            <button
              key={persona.id}
              onClick={() => setSelectedPersona(persona.id)}
              className={`flex-shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                selectedPersona === persona.id
                  ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400'
              }`}
            >
              <span>{persona.emoji}</span>
              <span className="hidden sm:inline">{persona.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Fake users list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {fakeUsers.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-600">No fake users yet</p>
              <p className="text-[10px] text-zinc-700 mt-1">Add virtual participants above</p>
            </div>
          ) : (
            fakeUsers.map(fake => {
              const persona = FAKE_USER_PERSONAS.find(p => p.id === fake.persona);
              return (
                <motion.div
                  key={fake.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2"
                >
                  {/* User header */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-violet-500/15 flex items-center justify-center text-sm">
                      {persona?.emoji || '🤖'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-zinc-200 truncate">{fake.displayName}</span>
                        <Badge className="h-4 px-1 text-[8px] bg-violet-500/20 text-violet-400 border-0">
                          {persona?.label || fake.persona}
                        </Badge>
                        {fake.autoBehavior && (
                          <Badge className="h-4 px-1 text-[8px] bg-emerald-500/20 text-emerald-400 border-0 animate-pulse">
                            <Zap className="w-2 h-2 mr-0.5" />Auto
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-600">{persona?.description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => handleRemoveFakeUser(fake)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Action buttons row */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[9px] bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                      onClick={() => handleFakeChat(fake)}
                    >
                      <MessageCircle className="w-3 h-3 mr-1" />Chat
                    </Button>
                    {REACTION_EMOJIS.slice(0, 3).map(r => (
                      <Button
                        key={r.type}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs bg-zinc-800 hover:bg-zinc-700"
                        onClick={() => handleFakeReaction(fake, r.type)}
                      >
                        {r.emoji}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[9px] bg-zinc-800 text-amber-400 hover:text-amber-300 hover:bg-zinc-700"
                      onClick={() => handleFakeHand(fake)}
                    >
                      <Hand className="w-3 h-3 mr-1" />Raise
                    </Button>
                  </div>

                  {/* Auto behavior toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-violet-400" />
                      <span className="text-[10px] text-zinc-500">Auto behavior</span>
                    </div>
                    <Switch
                      checked={fake.autoBehavior}
                      onCheckedChange={() => handleToggleAutoBehavior(fake)}
                      className="data-[state=checked]:bg-violet-600"
                    />
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Quick add multiple */}
      <div className="px-4 py-2 border-t border-zinc-800 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-[10px] text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
          onClick={() => {
            if (!engine) return;
            const names = ['Dr. Sarah Chen', 'Raj Kapoor', 'Maria Garcia', 'James Wilson', 'Priya Sharma', 'Ahmed Hassan', 'Lisa Park', 'Carlos Rodriguez', 'Yuki Tanaka', 'Emma Johnson'];
            const personas: FakeUserPersona[] = ['enthusiastic-student', 'active-participant', 'quiet-observer', 'networking-professional', 'industry-expert'];
            // Add 3-5 random fake users
            const count = 3 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
              const name = names[Math.floor(Math.random() * names.length)];
              const persona = personas[Math.floor(Math.random() * personas.length)];
              const fakeId = engine.createFakeUser(name, persona);
              if (fakeId) {
                const fakePeerId = engine.getFakeUserPeerIds().pop() || '';
                addFakeUser({
                  id: fakeId,
                  peerId: fakePeerId,
                  displayName: name,
                  persona,
                  isActive: true,
                  joinedAt: Date.now(),
                  autoBehavior: false,
                  lastActivityAt: Date.now(),
                });
              }
            }
            toast.success(`Added ${count} fake users`);
          }}
          disabled={!engine}
        >
          <Users className="w-3.5 h-3.5 mr-1" />
          Quick Add 3-5 Random Users
        </Button>
      </div>
    </div>
  );
}
