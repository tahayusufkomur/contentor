"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamChat, Channel, MessageResponse, Event } from "stream-chat";
import { Send, Heart, ThumbsUp, Flame, Star, Smile } from "lucide-react";

interface StreamChatPanelProps {
  client: StreamChat;
  channel: Channel;
  userId: string;
}

interface ChatMessage {
  id: string;
  text: string;
  userId: string;
  userName: string;
  createdAt: Date;
}

const REACTIONS = [
  { emoji: "❤️", icon: Heart, label: "Love" },
  { emoji: "👍", icon: ThumbsUp, label: "Like" },
  { emoji: "🔥", icon: Flame, label: "Fire" },
  { emoji: "⭐", icon: Star, label: "Star" },
  { emoji: "😊", icon: Smile, label: "Smile" },
];

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

export default function StreamChatPanel({
  client,
  channel,
  userId,
}: StreamChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [floatingReactions, setFloatingReactions] = useState<
    FloatingReaction[]
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reactionIdRef = useRef(0);

  const parseMessage = useCallback(
    (msg: MessageResponse): ChatMessage => ({
      id: msg.id,
      text: msg.text || "",
      userId: msg.user?.id || "",
      userName: msg.user?.name || msg.user?.id || "Unknown",
      createdAt: new Date(msg.created_at || Date.now()),
    }),
    [],
  );

  // Load existing messages + listen for new ones
  useEffect(() => {
    async function loadMessages() {
      const state = await channel.query({ messages: { limit: 50 } });
      if (state.messages) {
        setMessages(state.messages.map(parseMessage));
      }
    }
    loadMessages();

    const handleNew = (event: Event) => {
      if (event.message) {
        // Check if it's a reaction message
        if (event.message.text?.startsWith("reaction:")) {
          const emoji = event.message.text.replace("reaction:", "");
          spawnFloatingReaction(emoji);
          return;
        }
        setMessages((prev) => [...prev, parseMessage(event.message!)]);
      }
    };

    channel.on("message.new", handleNew);
    return () => {
      channel.off("message.new", handleNew);
    };
  }, [channel, parseMessage]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function spawnFloatingReaction(emoji: string) {
    const id = reactionIdRef.current++;
    const x = 20 + Math.random() * 60;
    setFloatingReactions((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2000);
  }

  async function sendMessage() {
    if (!input.trim()) return;
    await channel.sendMessage({ text: input.trim() });
    setInput("");
  }

  async function sendReaction(emoji: string) {
    spawnFloatingReaction(emoji);
    await channel.sendMessage({ text: `reaction:${emoji}` });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative">
      {/* Floating reactions */}
      {floatingReactions.map((r) => (
        <div
          key={r.id}
          className="absolute z-30 text-2xl animate-float-up pointer-events-none"
          style={{ left: `${r.x}%`, bottom: "80px" }}
        >
          {r.emoji}
        </div>
      ))}

      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
        <h3 className="text-white text-sm font-semibold">Live Chat</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-zinc-500 text-xs text-center mt-4">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-2">
            <div className="min-w-0">
              <span
                className={`text-xs font-medium ${
                  msg.userId === userId ? "text-green-400" : "text-blue-400"
                }`}
              >
                {msg.userName}
              </span>
              <span className="text-zinc-300 text-xs ml-1.5">{msg.text}</span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reactions bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-t border-zinc-800 shrink-0">
        {REACTIONS.map((r) => (
          <button
            key={r.emoji}
            onClick={() => sendReaction(r.emoji)}
            title={r.label}
            className="p-1.5 rounded hover:bg-zinc-800 transition-colors text-base"
          >
            {r.emoji}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="p-2 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
