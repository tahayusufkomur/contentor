"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getConversationThread,
  listConversations,
  releaseConversation,
  sendAgentMessage,
  takeoverConversation,
  type ConversationRow,
  type ThreadMessage,
} from "@/lib/assistant";

import { parseAnswer, systemLine } from "./format-answer";

const LIST_POLL_MS = 10_000;
const THREAD_POLL_MS = 3_000;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Walks a thread backwards from `index` to find the question this assistant
 * answer was responding to — that's what "Add to knowledge" should prefill,
 * not the answer itself (preserves the v1 teach loop from TranscriptsCard). */
function precedingUserMessage(thread: ThreadMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (thread[i].role === "user") return thread[i].content;
  }
  return "";
}

/** The coach's live console: every conversation the site assistant is
 * having, expandable inline into a full thread with takeover/reply/release
 * (the v2 human-handoff loop, Tasks 5/6). Replaces the old read-only
 * TranscriptsCard; "Add to knowledge" still closes the improvement loop from
 * any assistant answer in the thread. */
export function ConversationsCard({
  onAddToKnowledge,
}: {
  onAddToKnowledge: (question: string) => void;
}) {
  const t = useTranslations("admin");
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [active, setActive] = useState<number | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [status, setStatus] = useState<"ai" | "human">("ai");
  const [agentLabel, setAgentLabel] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [releasing, setReleasing] = useState(false);

  // High-water mark for the open thread's polling `after` param.
  const lastIdRef = useRef(0);
  // Mirrors `active` synchronously (state updates are async) so a response
  // for a conversation the coach has since navigated away from — open A,
  // click B before A's fetch/action resolves — can detect the mismatch and
  // skip applying itself to whatever thread is on screen now. The polling
  // effect below additionally guards itself with its own `cancelled` flag
  // scoped to that effect instance, which is enough for it alone, but the
  // one-shot action handlers (open/takeover/release/send) don't rerun on
  // every render the way an effect does, so they need this ref instead.
  const activeRef = useRef<number | null>(null);

  // Explicit origin, not read inline at each call site — keeps `parseAnswer`
  // SSR-safe (it never touches `window` itself) and gives every extracted
  // link a real same-origin check via the `URL` parser. See format-answer.ts.
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    listConversations(1)
      .then((r) => {
        setRows(r.results);
        setHasMore(r.has_more);
      })
      .catch(() => toast.error(t("assistant.loadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Idle list refresh — only while no thread is open, so a coach mid-reply
  // never has the surrounding list rewritten under them.
  useEffect(() => {
    if (active !== null) return;
    const iv = setInterval(() => {
      listConversations(1)
        .then((r) => {
          setRows(r.results);
          setHasMore(r.has_more);
          setPage(1);
        })
        .catch(() => {
          // Background refresh — stay silent, next tick tries again.
        });
    }, LIST_POLL_MS);
    return () => clearInterval(iv);
  }, [active]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await listConversations(next);
      setRows((current) => [...current, ...r.results]);
      setHasMore(r.has_more);
      setPage(next);
    } catch {
      toast.error(t("assistant.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  const patchRow = (id: number, patch: Partial<ConversationRow>) => {
    setRows((current) =>
      current.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

  // Merges messages the coach hasn't seen yet, deduped by id. Idempotent by
  // construction: whether the same batch arrives once, twice (a poll tick
  // that was already in flight when a takeover/release fully replaced the
  // thread underneath it), or slightly out of order, applying it twice never
  // duplicates a row and the high-water mark only ever moves forward.
  const mergeThread = (incoming: ThreadMessage[]) => {
    if (!incoming.length) return;
    setThread((current) => {
      const seen = new Set(current.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...current, ...fresh] : current;
    });
    lastIdRef.current = Math.max(
      lastIdRef.current,
      ...incoming.map((m) => m.id),
    );
  };

  const openThread = (id: number) => {
    if (active === id) {
      setActive(null);
      activeRef.current = null;
      return;
    }
    setActive(id);
    activeRef.current = id;
    setThread([]);
    setStatus("ai");
    setAgentLabel("");
    lastIdRef.current = 0;
    setThreadLoading(true);
    getConversationThread(id, 0)
      .then((payload) => {
        if (activeRef.current !== id) return;
        setThread(payload.messages);
        lastIdRef.current = payload.messages.length
          ? payload.messages[payload.messages.length - 1].id
          : 0;
        setStatus(payload.status);
        setAgentLabel(payload.agent_label);
      })
      .catch(() => {
        if (activeRef.current === id) toast.error(t("assistant.loadFailed"));
      })
      .finally(() => {
        if (activeRef.current === id) setThreadLoading(false);
      });
  };

  // Poll the open thread every 3s for anything new — including the
  // visitor's own messages, so the coach can watch a conversation live
  // before deciding to step in. `cancelled` is scoped to this effect
  // instance and flips on cleanup (conversation switched or closed), which
  // is enough on its own to stop a late response from this specific poll
  // from touching state — no `activeRef` needed here, unlike the one-shot
  // handlers below.
  useEffect(() => {
    if (active === null) return;
    let cancelled = false;
    const iv = setInterval(() => {
      getConversationThread(active, lastIdRef.current)
        .then((payload) => {
          if (cancelled) return;
          mergeThread(payload.messages);
          setStatus(payload.status);
          setAgentLabel(payload.agent_label);
          patchRow(active, {
            status: payload.status,
            human_requested: payload.human_requested,
          });
        })
        .catch(() => {
          // Missed tick — the next one in 3s tries again.
        });
    }, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const handleTakeover = async () => {
    if (active === null) return;
    const forId = active;
    setTakingOver(true);
    try {
      const payload = await takeoverConversation(forId);
      patchRow(forId, {
        status: payload.status,
        human_requested: payload.human_requested,
      });
      if (activeRef.current === forId) {
        setThread(payload.messages);
        lastIdRef.current = payload.messages.length
          ? payload.messages[payload.messages.length - 1].id
          : 0;
        setStatus(payload.status);
        setAgentLabel(payload.agent_label);
      }
    } catch {
      toast.error(t("assistant.loadFailed"));
    } finally {
      setTakingOver(false);
    }
  };

  const handleRelease = async () => {
    if (active === null) return;
    const forId = active;
    setReleasing(true);
    try {
      const payload = await releaseConversation(forId);
      patchRow(forId, {
        status: payload.status,
        human_requested: payload.human_requested,
      });
      if (activeRef.current === forId) {
        setThread(payload.messages);
        lastIdRef.current = payload.messages.length
          ? payload.messages[payload.messages.length - 1].id
          : 0;
        setStatus(payload.status);
        setAgentLabel(payload.agent_label);
      }
    } catch {
      toast.error(t("assistant.loadFailed"));
    } finally {
      setReleasing(false);
    }
  };

  const handleSend = async () => {
    const trimmed = reply.trim();
    if (!trimmed || active === null || sending) return;
    const forId = active;
    setSending(true);
    try {
      const payload = await sendAgentMessage(forId, trimmed, lastIdRef.current);
      if (activeRef.current === forId) {
        mergeThread(payload.messages);
        setStatus(payload.status);
        setAgentLabel(payload.agent_label);
      }
      patchRow(forId, {
        status: payload.status,
        human_requested: payload.human_requested,
      });
      setReply("");
    } catch {
      toast.error(t("assistant.loadFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistant.convTitle")}</CardTitle>
        <CardDescription>{t("assistant.convHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("assistant.convEmpty")}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {rows.map((row) => {
              const isActive = active === row.id;
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    onClick={() => openThread(row.id)}
                    className="flex w-full items-start gap-3 p-3 text-left text-sm transition-colors hover:bg-accent/40"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        row.status === "human"
                          ? "bg-primary"
                          : "bg-muted-foreground/30"
                      }`}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {row.user_label || t("assistant.convVisitor")}
                        </span>
                        {row.status === "human" && (
                          <Badge variant="brand">
                            {t("assistant.convLive")}
                          </Badge>
                        )}
                        {row.human_requested && (
                          <Badge variant="warning">
                            {t("assistant.convWantsHuman")}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.last_message}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <div>{relativeTime(row.updated_at)}</div>
                      <div>{row.message_count}</div>
                    </div>
                  </button>

                  {isActive && (
                    <div className="space-y-3 border-t bg-accent/20 p-3">
                      {threadLoading ? (
                        <Skeleton className="h-24 w-full" />
                      ) : (
                        <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border bg-background p-3">
                          {thread.map((message, index) => {
                            if (message.role === "system") {
                              const line = systemLine(
                                message.content,
                                (key, values) =>
                                  t(
                                    `assistant.${key}`,
                                    values as Record<string, string>,
                                  ),
                              );
                              if (!line) return null;
                              return (
                                <p
                                  key={message.id}
                                  className="text-center text-xs text-muted-foreground"
                                >
                                  {line}
                                </p>
                              );
                            }
                            if (message.role === "user") {
                              return (
                                <div
                                  key={message.id}
                                  className="flex justify-end"
                                >
                                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                                    {message.content}
                                  </div>
                                </div>
                              );
                            }
                            const { text, links } = parseAnswer(
                              message.content,
                              origin,
                            );
                            return (
                              <div key={message.id} className="flex">
                                <div className="max-w-[90%] space-y-1.5 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
                                  {message.role === "agent" && agentLabel && (
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {agentLabel}
                                    </p>
                                  )}
                                  <p className="whitespace-pre-wrap">{text}</p>
                                  {links.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {links.map(({ label, href }) => (
                                        <Link
                                          key={href + label}
                                          href={href}
                                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                        >
                                          {label}
                                          <ArrowRight className="h-3 w-3" />
                                        </Link>
                                      ))}
                                    </div>
                                  )}
                                  {message.role === "assistant" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onAddToKnowledge(
                                          precedingUserMessage(thread, index),
                                        )
                                      }
                                      className="text-xs font-medium text-primary hover:underline"
                                    >
                                      {t("assistant.addToKnowledge")}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {status === "ai" ? (
                          <Button
                            size="sm"
                            onClick={() => void handleTakeover()}
                            loading={takingOver}
                          >
                            {t("assistant.takeOver")}
                          </Button>
                        ) : (
                          <>
                            <form
                              className="flex flex-1 items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void handleSend();
                              }}
                            >
                              <Input
                                value={reply}
                                onChange={(e) => setReply(e.target.value)}
                                placeholder={t("assistant.replyPlaceholder")}
                                maxLength={2000}
                              />
                              <Button
                                type="submit"
                                size="sm"
                                loading={sending}
                                disabled={!reply.trim()}
                              >
                                {t("assistant.replySend")}
                              </Button>
                            </form>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRelease()}
                              loading={releasing}
                            >
                              {t("assistant.release")}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            loading={loadingMore}
          >
            {t("assistant.loadMore")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
