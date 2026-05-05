'use client';

import { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '@/store/room-store';
import { Send, MessageCircle, X, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const QUICK_EMOJIS = ['👍', '👏', '❤️', '😂', '🔥', '👋', '🎉', '💯', '🤔', '👀', '✅', '🙏'];

export function ChatPanel() {
  const { chatMessages, isChatOpen, setChatOpen, engine, myNode, nodes } = useRoomStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSend = () => {
    if (!input.trim() || !engine) return;
    engine.sendChatMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji: string) => {
    setInput(prev => prev + emoji);
    setShowEmoji(false);
  };

  if (!isChatOpen) return null;

  const participantCount = nodes.size;

  return (
    <div className="w-full sm:w-80 border-l border-zinc-800 bg-zinc-950 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-200">Chat</span>
          <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded-full">
            To everyone • {participantCount}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
          onClick={() => setChatOpen(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3">
        <div ref={scrollRef} className="py-3 space-y-3">
          {chatMessages.length === 0 && (
            <div className="text-center py-8">
              <MessageCircle className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-zinc-600 text-xs">No messages yet</p>
              <p className="text-zinc-700 text-xs mt-1">Be the first to say something!</p>
            </div>
          )}
          {chatMessages.map((msg) => (
            <ChatMessageBubble key={msg.id} msg={msg} isOwn={msg.senderId === myNode?.peerId} />
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-zinc-800">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm placeholder:text-zinc-600 focus-visible:ring-zinc-600 pr-9"
            />
            <Popover open={showEmoji} onOpenChange={setShowEmoji}>
              <PopoverTrigger asChild>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  onClick={() => setShowEmoji(!showEmoji)}
                >
                  <Smile className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2 bg-zinc-800 border-zinc-700" align="end" side="top">
                <div className="grid grid-cols-6 gap-1">
                  {QUICK_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => addEmoji(emoji)}
                      className="w-8 h-8 rounded hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            size="icon"
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatMessageBubble({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
  if (msg.type === 'system') {
    return (
      <div className="text-center">
        <span className="text-[10px] text-zinc-500 bg-zinc-900/80 border border-zinc-800 px-3 py-1 rounded-full">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
      <span className="text-[10px] text-zinc-600 mb-0.5 px-1">
        {msg.senderName} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-xl text-sm break-words
          ${isOwn
            ? 'bg-emerald-600/20 text-emerald-100 rounded-br-sm'
            : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'
          }`}
      >
        {msg.content}
      </div>
    </div>
  );
}
