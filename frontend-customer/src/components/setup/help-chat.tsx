"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { applyThreadPoll, type AnswerMeta } from "@/lib/assistant";
import {
  fetchHelpThread,
  HelpBotUnavailable,
  rateAnswer,
  requestHelpHuman,
  sendHelpHumanMessage,
  streamHelpBotChat,
  useHelpBotStatus,
  type ChatMessage,
} from "@/lib/help-bot";
import { useSetupStatus } from "@/lib/setup-assistant";

const LINK_RE = /\[([^\]]+)\]\((\/admin\/[^)\s]*)\)/g;

type Msg = {
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  meta?: AnswerMeta;
  rated?: "up" | "down";
};

/** Bot answers are markdown-lite: plain text + **bold** + whitelisted
 * /admin links. Links render as "take me there" buttons below the text —
 * coaches never see raw paths. */
function AnswerBody({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate: () => void;
}) {
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
              onClick={onNavigate}
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

export function HelpChat({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("admin");
  const botStatus = useHelpBotStatus();
  const setup = useSetupStatus();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "human">("ai");
  const [agentLabel, setAgentLabel] = useState("");
  const [humanRequested, setHumanRequested] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  // Flips true once a fetchHelpThread() round-trip has actually completed —
  // deliberately NOT derived from lastIdRef (see applyThreadPoll's doc
  // comment in lib/assistant.ts for why `lastId === 0` is the wrong signal:
  // a thread that's never had any messages yet — including one that 404s
  // because no conversation row exists — never advances lastId, which would
  // keep treating every later tick as "initial" too and re-replay the first
  // exchange on top of its own local echo from send()). Stays false across
  // a failed/missing tick so the eventual first real tick still gets the
  // full-replay treatment a returning session needs.
  const hydratedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Poll for persisted history + superadmin-takeover replies for as long as
  // this component is mounted. Unlike the floating student bubble (which
  // stays mounted across an `open` boolean and must self-guard its polling),
  // HelpChat has no visibility state of its own — the setup panel only
  // mounts it while the coach is actually on the "help" tab (see
  // setup-assistant-panel.tsx's `{showHelp ? <HelpChat .../> : ...}`), so
  // mount lifetime already IS visibility. `initial` is captured synchronously
  // from hydratedRef BEFORE the await, same as the site assistant bubble.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const initial = !hydratedRef.current;
      const thread = await fetchHelpThread(lastIdRef.current);
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
  }, [mode, humanRequested]);

  if (botStatus && !botStatus.enabled) {
    const key = botStatus.reason === "quota" ? "quota" : "unavailable";
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t(`setup.help.${key}`)}
      </div>
    );
  }

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");

    if (mode === "human") {
      setMessages((cur) => [...cur, { role: "user", content: trimmed }]);
      setFollowUps([]);
      if (!(await sendHelpHumanMessage(trimmed))) {
        setError(t("setup.help.error"));
      }
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
      const result = await streamHelpBotChat(
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
        // The chat call found the conversation already in human mode
        // server-side — the coach's message is stored, but there's no
        // stream to read. Drop the empty streaming placeholder and let the
        // poller deliver whatever the human agent sends back.
        setMessages((current) => current.slice(0, -1));
        setMode("human");
      }
    } catch (err) {
      setMessages(priorMessages);
      setInput(trimmed);
      setError(
        err instanceof HelpBotUnavailable
          ? t(
              err.reason === "quota"
                ? "setup.help.quota"
                : "setup.help.unavailable",
            )
          : t("setup.help.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  const requestHumanHandoff = async () => {
    setHumanRequested(true);
    await requestHelpHuman();
  };

  const systemLine = (content: string): string | null => {
    if (content.startsWith("agent_joined:")) {
      return t("setup.help.agentJoined", {
        name: content.slice("agent_joined:".length),
      });
    }
    if (content === "assistant_resumed")
      return t("setup.help.assistantResumed");
    if (content === "human_requested")
      return t("setup.help.humanRequestedLine");
    return null;
  };

  // Context-aware conversation starters from the coach's own setup state.
  const undone = new Set(
    (setup?.items ?? []).filter((i) => !i.done).map((i) => i.key),
  );
  const suggestions = [
    undone.has("payouts") && t("setup.help.suggestPayouts"),
    undone.has("publish") && t("setup.help.suggestPublish"),
    t("setup.help.suggestStudents"),
    t("setup.help.suggestPlans"),
  ]
    .filter((s): s is string => Boolean(s))
    .slice(0, 3);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {mode === "human" && (
        <div className="border-b bg-accent/50 px-4 py-2 text-xs text-muted-foreground">
          {t("setup.help.humanModeNotice", { name: agentLabel })}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("setup.help.intro")}
            </div>
            <div className="flex flex-col items-start gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary hover:bg-accent"
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
                    <AnswerBody
                      content={message.content}
                      onNavigate={onNavigate}
                    />
                    {message.meta && (
                      <div className="mt-1.5 flex items-center gap-1">
                        {(["up", "down"] as const).map((r) => (
                          <button
                            key={r}
                            type="button"
                            aria-label={t(
                              r === "up"
                                ? "setup.help.rateUp"
                                : "setup.help.rateDown",
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
                    aria-label={t("setup.help.thinking")}
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
                className="rounded-full border px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary hover:bg-accent"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="text-center text-xs text-destructive">{error}</p>
        )}
      </div>
      {mode === "ai" && !humanRequested && messages.length > 0 && (
        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => void requestHumanHandoff()}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t("setup.help.talkToHuman")}
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
          placeholder={t("setup.help.placeholder")}
          maxLength={2000}
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label={t("setup.help.send")}
          className="rounded-md bg-primary p-2 text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
