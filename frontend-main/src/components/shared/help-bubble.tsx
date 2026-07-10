"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  MessageCircleQuestion,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface AnswerMeta {
  transcriptId?: number;
  rateToken?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  meta?: AnswerMeta;
  rated?: "up" | "down";
}

// The visitor persona may only emit these marketing targets.
const LINK_RE = /\[([^\]]+)\]\((\/(?:signup|pricing|demo|login)[^)\s]*)\)/g;
// Marketing pages only — never the superadmin SPA, dashboard or auth flows.
const HIDDEN_PREFIXES = ["/admin", "/dashboard", "/callback"];

const sessionId =
  globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2);

/** Fire-and-forget thumbs. Returns false on any failure — rating is
 * best-effort, the UI just resets its highlight. */
async function rateAnswer(
  meta: AnswerMeta,
  rating: "up" | "down",
): Promise<boolean> {
  if (!meta.transcriptId || !meta.rateToken) return false;
  try {
    const res = await fetch("/api/v1/ai/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript_id: meta.transcriptId,
        rate_token: meta.rateToken,
        rating,
      }),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

async function streamChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onDone?: (meta: AnswerMeta) => void,
): Promise<void> {
  const res = await fetch("/api/v1/help/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`help chat failed (${res.status})`);
  if (res.headers.get("content-type")?.includes("application/json")) {
    // Caps/config problems come back as plain JSON, not a stream.
    throw new Error("unavailable");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("streaming unsupported");
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as {
        type: "delta" | "done" | "error";
        text?: string;
        transcript_id?: number;
        rate_token?: string;
      };
      if (event.type === "delta" && event.text) onDelta(event.text);
      else if (event.type === "done") {
        done = true;
        onDone?.({
          transcriptId: event.transcript_id,
          rateToken: event.rate_token,
        });
      } else if (event.type === "error") throw new Error("answer failed");
    }
  }
  if (!done) throw new Error("stream ended early");
}

function AnswerBody({ content }: { content: string }) {
  const links: { label: string; href: string }[] = [];
  const text = content
    .replace(LINK_RE, (_, label: string, href: string) => {
      links.push({ label, href });
      return "";
    })
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
  return (
    <div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {links.map(({ label, href }) => (
            <Link
              key={href + label}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Ask Contentor" for anonymous marketing-site visitors: floating bubble +
 * compact chat popover, streaming answers from /api/v1/help/chat/. */
export function HelpBubble() {
  const t = useTranslations("marketing.helpBot");
  const pathname = usePathname() ?? "";
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/v1/help/status/")
      .then((res) => res.json())
      .then((data: { enabled: boolean }) => setEnabled(Boolean(data.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  if (!enabled || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError(false);
    setInput("");
    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      await streamChat(
        history,
        (delta) => {
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            next[next.length - 1] = {
              role: "assistant",
              content: last.content + delta,
            };
            return next;
          });
        },
        (meta) =>
          setMessages((current) => {
            const next = [...current];
            next[next.length - 1] = { ...next[next.length - 1], meta };
            return next;
          }),
      );
    } catch {
      setMessages(history.slice(0, -1));
      setInput(trimmed);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = [
    t("suggestPrice"),
    t("suggestPayouts"),
    t("suggestDomain"),
  ];

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label={t("bubbleLabel")}
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl"
        >
          <MessageCircleQuestion className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[min(560px,calc(100dvh-3rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">{t("title")}</span>
            <button
              type="button"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3 pt-1">
                <p className="text-sm text-muted-foreground">{t("intro")}</p>
                <div className="flex flex-col items-start gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      className="rounded-full border px-3 py-1.5 text-left text-xs transition-colors hover:border-primary hover:bg-accent"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={index} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={index} className="flex">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                    {message.content ? (
                      <>
                        <AnswerBody content={message.content} />
                        {message.meta && (
                          <div className="mt-1.5 flex items-center gap-1">
                            {(["up", "down"] as const).map((r) => (
                              <button
                                key={r}
                                type="button"
                                aria-label={t(
                                  r === "up" ? "rateUp" : "rateDown",
                                )}
                                disabled={Boolean(message.rated)}
                                onClick={() => {
                                  void rateAnswer(message.meta!, r);
                                  setMessages((current) =>
                                    current.map((m, i) =>
                                      i === index ? { ...m, rated: r } : m,
                                    ),
                                  );
                                }}
                                className={`rounded p-1 transition-colors hover:bg-accent ${message.rated === r ? "text-primary" : "text-muted-foreground/60"} disabled:hover:bg-transparent`}
                              >
                                {r === "up" ? (
                                  <ThumbsUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ThumbsDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <span
                        className="inline-flex gap-1 py-1"
                        aria-label={t("thinking")}
                      >
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
                      </span>
                    )}
                  </div>
                </div>
              ),
            )}
            {error && (
              <p className="text-center text-xs text-destructive">
                {t("error")}
              </p>
            )}
          </div>
          <form
            className="flex items-center gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              maxLength={2000}
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label={t("send")}
              className="rounded-md bg-primary p-2 text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
