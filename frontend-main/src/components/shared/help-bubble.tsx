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
  suggestions?: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Msg = {
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  meta?: AnswerMeta;
  rated?: "up" | "down";
};

interface ThreadMessage {
  id: number;
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  created_at: string;
}

interface ThreadPayload {
  session_id: string;
  status: "ai" | "human";
  agent_label: string;
  human_requested: boolean;
  messages: ThreadMessage[];
}

/** Pure poll-tick reducer for the widget's thread polling effect. Given a
 * freshly-fetched thread, the previous high-water-mark message id, and
 * whether this is the widget's first-ever successful fetch (`initial` — the
 * CALLER must capture this before awaiting the fetch, from a ref that only
 * flips true once a fetch has actually completed, never from `lastId === 0`:
 * a genuinely-empty first fetch never advances `lastId`, so deriving
 * "initial" from `lastId === 0` would keep re-triggering a full-role replay
 * on every later tick too — duplicating the very first Q&A exchange once
 * it's actually persisted, since that exchange is already a local echo from
 * `send()`). Returns which rows to append (all roles when `initial`, else
 * only `agent`/`system` — `user`/`assistant` rows are already local echoes)
 * and the new high-water mark. Copied verbatim (structure-for-structure)
 * from frontend-customer's lib/assistant.ts::applyThreadPoll — frontend-main
 * is a separate Next.js app and can't import across app boundaries, so this
 * widget is self-contained; see that file's doc comment for the fix history
 * behind this exact shape. */
function applyThreadPoll(
  thread: ThreadPayload,
  lastId: number,
  initial: boolean,
): { appended: ThreadMessage[]; lastId: number } {
  const incoming = thread.messages.filter((m) => m.id > lastId);
  const nextLastId = incoming.length
    ? incoming[incoming.length - 1].id
    : lastId;
  const appended = incoming.filter(
    (m) => initial || m.role === "agent" || m.role === "system",
  );
  return { appended, lastId: nextLastId };
}

// ── Session (localStorage key "contentor.ai.session.help" — same string as
// frontend-customer's coach help-chat session key, but a different origin,
// so there's no collision) ──────────────────────────────────────────────────
const SESSION_KEY = "contentor.ai.session.help";
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

/** Pure so rotation logic is easy to reason about without a DOM. */
function resolveSession(
  raw: string | null,
  now: number,
): { id: string; fresh: boolean } {
  try {
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string; ts?: number };
      if (
        parsed.id &&
        typeof parsed.ts === "number" &&
        now - parsed.ts < SESSION_IDLE_MS
      ) {
        return { id: parsed.id, fresh: false };
      }
    }
  } catch {
    // fall through to a fresh session
  }
  return {
    id: globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2),
    fresh: true,
  };
}

let sessionId = "";

function getSessionId(): string {
  if (sessionId) return sessionId;
  const raw =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(SESSION_KEY);
  sessionId = resolveSession(raw, Date.now()).id;
  touchSession();
  return sessionId;
}

function touchSession(): void {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ id: sessionId, ts: Date.now() }),
    );
  } catch {
    // storage unavailable — session stays in-memory
  }
}

// The visitor persona may only emit these marketing targets.
const LINK_RE = /\[([^\]]+)\]\((\/(?:signup|pricing|demo|login)[^)\s]*)\)/g;
// Marketing pages only — never the superadmin SPA, dashboard or auth flows.
const HIDDEN_PREFIXES = ["/admin", "/dashboard", "/callback"];

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

/** POSTs the transcript and streams the answer. Resolves `"ai"` when the AI
 * answered, `"human"` when the conversation was already in human mode
 * server-side (the visitor's message is stored, no stream to read — the
 * poller delivers the reply). */
async function streamChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onDone?: (meta: AnswerMeta) => void,
): Promise<"ai" | "human"> {
  const res = await fetch("/api/v1/help/chat/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ messages, session_id: getSessionId() }),
  });
  if (!res.ok) throw new Error(`help chat failed (${res.status})`);
  if (res.headers.get("content-type")?.includes("application/json")) {
    // Caps/config problems, and a conversation already in human mode, come
    // back as plain JSON, not a stream.
    const data = (await res.json()) as { mode?: string };
    if (data.mode === "human") {
      touchSession();
      return "human";
    }
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
        suggestions?: string[];
      };
      if (event.type === "delta" && event.text) onDelta(event.text);
      else if (event.type === "done") {
        done = true;
        onDone?.({
          transcriptId: event.transcript_id,
          rateToken: event.rate_token,
          suggestions: event.suggestions,
        });
      } else if (event.type === "error") throw new Error("answer failed");
    }
  }
  if (!done) throw new Error("stream ended early");
  touchSession();
  return "ai";
}

/** Widget polling endpoint — this session's own thread. Any failure OTHER
 * than a 404 (network error, 5xx — genuinely unknown state) resolves to
 * null so the poller just skips that tick.
 *
 * A 404 is deliberately NOT treated the same as those failures: the backend
 * returns it whenever this session has never sent a message yet (no
 * AiConversation row exists for it to look up — see
 * help_bot_public_thread), which is the DEFINITIVE, expected answer for
 * "zero messages", not an unknown one. It happens on literally every
 * brand-new session's very first poll tick, since the conversation row is
 * only created lazily by the chat POST. Collapsing that into the same
 * `null` used for real failures would leave `hydratedRef` (see HelpBubble's
 * polling effect) stuck at `false` past that always-404 first tick — so the
 * NEXT tick to actually succeed would be wrongly treated as "initial" even
 * though the visitor may have already sent (and locally echoed) their first
 * message by then, replaying it a second time on top of that echo. Mapping
 * a 404 to an empty `ThreadPayload` instead lets that first tick complete
 * hydration immediately with zero messages, exactly like a genuinely empty
 * (200, `messages: []`) thread already does. */
async function fetchThread(after = 0): Promise<ThreadPayload | null> {
  try {
    const res = await fetch(
      `/api/v1/help/thread/?session=${getSessionId()}&after=${after}`,
      { credentials: "same-origin" },
    );
    if (res.status === 404) {
      return {
        session_id: getSessionId(),
        status: "ai",
        agent_label: "",
        human_requested: false,
        messages: [],
      };
    }
    if (!res.ok) return null;
    return (await res.json()) as ThreadPayload;
  } catch {
    return null;
  }
}

async function sendHumanMessage(content: string): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/help/human-message/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ session_id: getSessionId(), content }),
    });
    touchSession();
    return res.ok;
  } catch {
    return false;
  }
}

async function requestHuman(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/help/human-request/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ session_id: getSessionId() }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
 * compact chat popover, streaming answers from /api/v1/help/chat/, with
 * persisted session/thread history and human-takeover support. */
export function HelpBubble() {
  const t = useTranslations("marketing.helpBot");
  const pathname = usePathname() ?? "";
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [agentLabel, setAgentLabel] = useState("");
  const [humanRequested, setHumanRequested] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  // Flips true once a fetchThread() round-trip has actually completed —
  // deliberately NOT derived from lastIdRef (see applyThreadPoll's doc
  // comment above for why `lastId === 0` is the wrong signal: a genuinely-
  // empty first fetch never advances lastId, which would keep treating
  // every later tick as "initial" too and re-replay the first exchange on
  // top of its own local echo). Stays false across a failed/cancelled tick
  // so a retry still gets the full-replay treatment.
  const hydratedRef = useRef(false);

  useEffect(() => {
    fetch("/api/v1/help/status/")
      .then((res) => res.json())
      .then((data: { enabled: boolean }) => setEnabled(Boolean(data.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Hydrate the persisted thread on open, then poll for human-takeover
  // replies. Polls faster once a human is (or has been requested to be)
  // involved. `initial` is captured synchronously BEFORE the await from
  // hydratedRef — a suggested-question chip click can add local messages
  // while the first fetchThread() round-trip is still in flight, and
  // hydratedRef (unlike lastIdRef or the local message list) is never
  // touched by send(), so it can't be raced by that concurrent local echo.
  // On the very first successful tick the entire stored thread replays; on
  // every tick after that only agent/system rows append — user/assistant
  // rows are already local echoes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      const initial = !hydratedRef.current;
      const thread = await fetchThread(lastIdRef.current);
      if (cancelled || !thread) return;
      hydratedRef.current = true;
      setMode(thread.status);
      setAgentLabel(thread.agent_label);
      setHumanRequested(thread.human_requested);
      const { appended, lastId } = applyThreadPoll(
        thread,
        lastIdRef.current,
        initial,
      );
      lastIdRef.current = lastId;
      if (appended.length) {
        setMessages((cur) => [
          ...cur,
          ...appended.map((m) => ({ role: m.role, content: m.content }) as Msg),
        ]);
      }
    };
    void tick();
    const iv = setInterval(
      tick,
      mode === "human" || humanRequested ? 3000 : 5000,
    );
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [open, mode, humanRequested]);

  if (!enabled || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError(false);
    setInput("");

    if (mode === "human") {
      setMessages((cur) => [...cur, { role: "user", content: trimmed }]);
      setFollowUps([]);
      if (!(await sendHumanMessage(trimmed))) setError(true);
      return;
    }

    const priorMessages = messages;
    const history: ChatMessage[] = [
      ...messages
        .filter(
          (m): m is Msg & { role: "user" | "assistant" } =>
            m.role === "user" || m.role === "assistant",
        )
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: trimmed },
    ];
    setMessages([
      ...priorMessages,
      { role: "user", content: trimmed },
      { role: "assistant", content: "" },
    ]);
    setFollowUps([]);
    setBusy(true);
    try {
      const result = await streamChat(
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
        (meta) => {
          setMessages((current) => {
            const next = [...current];
            next[next.length - 1] = { ...next[next.length - 1], meta };
            return next;
          });
          setFollowUps(meta.suggestions ?? []);
        },
      );
      if (result === "human") {
        // The chat call raced into human mode server-side — the reply is
        // already stored; drop the empty streaming placeholder and let the
        // poller deliver it.
        setMessages((current) => current.slice(0, -1));
        setMode("human");
      }
    } catch {
      setMessages(priorMessages);
      setInput(trimmed);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const requestHumanHandoff = async () => {
    setHumanRequested(true);
    await requestHuman();
  };

  const suggestions = [
    t("suggestPrice"),
    t("suggestPayouts"),
    t("suggestDomain"),
  ];

  const systemLine = (content: string): string | null => {
    if (content.startsWith("agent_joined:")) {
      return t("agentJoined", {
        name: content.slice("agent_joined:".length),
      });
    }
    if (content === "assistant_resumed") return t("assistantResumed");
    if (content === "human_requested") return t("humanRequestedLine");
    return null;
  };

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
          {mode === "human" && (
            <div className="border-b bg-accent/50 px-4 py-2 text-xs text-muted-foreground">
              {t("humanModeNotice", { name: agentLabel })}
            </div>
          )}
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
            {messages.map((message, index) => {
              if (message.role === "user") {
                return (
                  <div key={index} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {message.content}
                    </div>
                  </div>
                );
              }
              if (message.role === "system") {
                const line = systemLine(message.content);
                if (!line) return null;
                return (
                  <p
                    key={index}
                    className="text-center text-xs text-muted-foreground"
                  >
                    {line}
                  </p>
                );
              }
              return (
                <div key={index} className="flex">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                    {message.role === "agent" && agentLabel && (
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {agentLabel}
                      </p>
                    )}
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
              );
            })}
            {followUps.length > 0 && !busy && mode === "ai" && (
              <div className="flex flex-col items-start gap-2">
                {followUps.map((suggestion) => (
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
            )}
            {error && (
              <p className="text-center text-xs text-destructive">
                {t("error")}
              </p>
            )}
          </div>
          {mode === "ai" && !humanRequested && messages.length > 0 && (
            <div className="px-3 pt-2">
              <button
                type="button"
                onClick={() => void requestHumanHandoff()}
                className="text-xs font-medium text-primary hover:underline"
              >
                {t("talkToHuman")}
              </button>
            </div>
          )}
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
