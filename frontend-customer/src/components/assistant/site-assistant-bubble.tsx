"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  ExternalLink,
  MessageCircleQuestion,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  applyThreadPoll,
  AssistantUnavailable,
  decideLink,
  fetchThread,
  rateAssistantAnswer,
  requestHuman,
  sendHumanMessage,
  streamAssistantChat,
  useAssistantStatus,
  type AnswerMeta,
  type ChatMessage,
} from "@/lib/assistant";

// Any site path or coach-whitelisted external URL the bot emits renders as a
// button. The extraction regex below is a syntactic first pass only — it
// accepts a leading `/` (internal path) or a `https://` URL (candidate
// external link); it does NOT decide safety. It is NOT the safety boundary:
// naive regex acceptance of `//evil.com` (protocol-relative) or `/\evil.com`
// (the WHATWG URL Standard treats a backslash right after the leading slash
// exactly like a second slash for http/https URLs, so real browsers resolve
// it to host `evil.com`) would be a bypass, and a character-class regex can
// never rule out every such parser quirk on its own. The actual safety
// boundary is `decideLink` (frontend-customer/src/lib/assistant.ts): every
// extracted href is resolved with the real `URL` parser (the same algorithm
// a browser uses to navigate) and classified `"internal"` only if the
// resolved origin matches the page's own, `"external"` only on an EXACT
// match against the coach's link whitelist, and dropped (`null`) otherwise.
const LINK_RE = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*|https:\/\/[^)\s]+)\)/g;
// /learn is the focused course player — never overlay it.
const HIDDEN_PREFIXES = [
  "/learn",
  "/admin",
  "/login",
  "/callback",
  "/checkout",
];

type Msg = {
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  meta?: AnswerMeta;
  rated?: "up" | "down";
};

function AnswerBody({
  content,
  whitelist,
}: {
  content: string;
  whitelist: string[];
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const links: {
    label: string;
    href: string;
    kind: "internal" | "external";
  }[] = [];
  const text = content
    .replace(LINK_RE, (_, label: string, href: string) => {
      const kind = decideLink(href, origin, whitelist);
      if (kind) links.push({ label, href, kind });
      return "";
    })
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
  return (
    <div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {links.map(({ label, href, kind }) =>
            kind === "internal" ? (
              <Link
                key={href + label}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {label}
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <a
                key={href + label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** "Ask {brand}" for students and anonymous visitors on the tenant site:
 * floating bubble + compact chat popover, streaming answers from
 * /api/v1/assistant/chat/. Owner-excluded (mounted by the caller only for
 * non-owners) so the bottom-right corner stays free for the EditButton. */
export function SiteAssistantBubble() {
  const t = useTranslations("student.assistant");
  const pathname = usePathname() ?? "";
  const status = useAssistantStatus();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"generic" | "session_limit" | null>(null);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [agentLabel, setAgentLabel] = useState("");
  const [humanRequested, setHumanRequested] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  // Flips true once a fetchThread() round-trip has actually completed —
  // deliberately NOT derived from lastIdRef (see applyThreadPoll's doc
  // comment in lib/assistant.ts for why `lastId === 0` is the wrong signal:
  // a genuinely-empty first fetch never advances lastId, which would keep
  // treating every later tick as "initial" too and re-replay the first
  // exchange on top of its own local echo). Stays false across a failed/
  // cancelled tick so a retry still gets the full-replay treatment.
  const hydratedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Hydrate the persisted thread on open, then poll for human-takeover
  // replies. Polls faster once a human is (or has been requested to be)
  // involved. `initial` is captured synchronously BEFORE the await from
  // hydratedRef — a suggested-question chip click can add local messages
  // while the first fetchThread() round-trip is still in flight, and
  // hydratedRef (unlike lastIdRef or the local message list) is never
  // touched by send(), so it can't be raced by that concurrent local
  // echo. On the very first successful tick the entire stored thread
  // replays; on every tick after that only agent/system rows append —
  // user/assistant rows are already local echoes.
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

  if (!status?.enabled || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");

    if (mode === "human") {
      setMessages((cur) => [...cur, { role: "user", content: trimmed }]);
      setFollowUps([]);
      if (!(await sendHumanMessage(trimmed))) setError("generic");
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
      const result = await streamAssistantChat(
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
    } catch (err) {
      setMessages(priorMessages);
      setInput(trimmed);
      setError(
        err instanceof AssistantUnavailable && err.reason === "session_limit"
          ? "session_limit"
          : "generic",
      );
    } finally {
      setBusy(false);
    }
  };

  const requestHumanHandoff = async () => {
    setHumanRequested(true);
    await requestHuman();
  };

  const suggestions = status.suggested_questions;
  const whitelist = status.link_whitelist ?? [];

  const systemLine = (content: string): string | null => {
    if (content.startsWith("agent_joined:")) {
      return t("agentJoined", {
        name: content.slice("agent_joined:".length),
      });
    }
    if (content === "assistant_resumed") return t("assistantResumed");
    if (content === "human_requested")
      return t("humanRequestedLine", { brand: status.brand });
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
            <span className="text-sm font-semibold">
              {t("title", { brand: status.brand })}
            </span>
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
                <p className="text-sm text-muted-foreground">
                  {status.greeting || t("intro")}
                </p>
                {suggestions.length > 0 && (
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
                )}
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
                        <AnswerBody
                          content={message.content}
                          whitelist={whitelist}
                        />
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
                                  void rateAssistantAnswer(message.meta!, r);
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
                    data-testid="assistant-suggestion"
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
                {error === "session_limit" ? t("sessionLimit") : t("error")}
              </p>
            )}
          </div>
          {status.human_handoff &&
            mode === "ai" &&
            !humanRequested &&
            messages.length > 0 && (
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
          <p className="px-3 pb-2 text-center text-[10px] text-muted-foreground">
            {t("disclosure", { brand: status.brand })}
          </p>
        </div>
      )}
    </>
  );
}
