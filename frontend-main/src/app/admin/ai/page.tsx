"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, GraduationCap, Newspaper, Palette, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AiFeatureRollup {
  key: string;
  label: string;
  count: number;
  usd_spent: string;
  usd_cap: number;
  kill_switch_tripped: boolean;
}

interface AiTopTenant {
  tenant_schema: string;
  usd_spent: string;
  count: number;
}

interface AiDailyQuestion {
  date: string;
  count: number;
}

interface AiUsageRollup {
  month: string;
  features: AiFeatureRollup[];
  top_tenants: AiTopTenant[];
  ratings: { up: number; down: number; unrated: number };
  daily_questions: AiDailyQuestion[];
}

const FEATURE_ICONS: Record<string, typeof Bot> = {
  help_bot: Bot,
  student_bot: GraduationCap,
  blog_ai: Newspaper,
  brand_pack: Palette,
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// ── Conversations console (superadmin view of every help-bot conversation:
// coach console + marketing visitor bubble, across all tenants) ────────────

interface ConversationRow {
  id: number;
  session_id: string;
  audience: "coach" | "visitor";
  tenant_schema: string;
  status: "ai" | "human";
  user_label: string;
  human_requested: boolean;
  message_count: number;
  last_message: string;
  updated_at: string;
}

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

const CONVO_LIST_POLL_MS = 10_000;
const CONVO_THREAD_POLL_MS = 3_000;

async function fetchConversations(
  audience: string,
): Promise<{ results: ConversationRow[]; has_more: boolean }> {
  const res = await fetch(
    `/api/v1/platform/ai-conversations/?audience=${audience}`,
    { credentials: "same-origin" },
  );
  if (!res.ok) throw new Error("Failed to load conversations");
  return res.json();
}

async function fetchConversationThread(
  id: number,
  after = 0,
): Promise<ThreadPayload> {
  const res = await fetch(
    `/api/v1/platform/ai-conversations/${id}/thread/?after=${after}`,
    { credentials: "same-origin" },
  );
  if (!res.ok) throw new Error("Failed to load thread");
  return res.json();
}

async function takeoverConversation(id: number): Promise<ThreadPayload> {
  const res = await fetch(`/api/v1/platform/ai-conversations/${id}/takeover/`, {
    method: "POST",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("Failed to take over conversation");
  return res.json();
}

async function releaseConversation(id: number): Promise<ThreadPayload> {
  const res = await fetch(`/api/v1/platform/ai-conversations/${id}/release/`, {
    method: "POST",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("Failed to release conversation");
  return res.json();
}

async function sendConversationMessage(
  id: number,
  content: string,
  after: number,
): Promise<ThreadPayload> {
  const res = await fetch(`/api/v1/platform/ai-conversations/${id}/message/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ content, after }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json();
}

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

/** system-role thread tokens (produced by the takeover kernel) rendered as
 * short plain-English lines; unrecognized tokens render nothing. */
function conversationSystemLine(content: string): string | null {
  if (content.startsWith("agent_joined:")) {
    return `${content.slice("agent_joined:".length)} joined`;
  }
  if (content === "assistant_resumed") return "Assistant resumed";
  if (content === "human_requested") return "Asked for a human";
  return null;
}

/** Superadmin's live console over every help-bot conversation platform-wide
 * (coach console + marketing visitor bubble). Row click opens a right-side
 * thread drawer with the same takeover/reply/release loop as the coach's
 * own ConversationsCard (frontend-customer), reimplemented here with plain
 * `fetch` since frontend-main is a separate app with no shared lib. */
function ConversationsSection() {
  const [audienceFilter, setAudienceFilter] = useState("");
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [activeId, setActiveId] = useState<number | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [status, setStatus] = useState<"ai" | "human">("ai");
  const [agentLabel, setAgentLabel] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [releasing, setReleasing] = useState(false);

  // High-water mark for the open thread's polling `after` param.
  const lastIdRef = useRef(0);
  // Mirrors `activeId` synchronously (state updates are async) so a
  // response for a conversation the superadmin has since navigated away
  // from — open A, click B before A's fetch/action resolves — can detect
  // the mismatch and skip applying itself to whatever's on screen now.
  const activeRef = useRef<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setListError("");
    fetchConversations(audienceFilter)
      .then((r) => setRows(r.results))
      .catch((err) => setListError(err.message))
      .finally(() => setLoading(false));
  }, [audienceFilter]);

  // Idle list refresh — only while no thread is open, so a superadmin
  // mid-reply never has the surrounding list rewritten under them.
  useEffect(() => {
    if (activeId !== null) return;
    const iv = setInterval(() => {
      fetchConversations(audienceFilter)
        .then((r) => setRows(r.results))
        .catch(() => {
          // Background refresh — stay silent, next tick tries again.
        });
    }, CONVO_LIST_POLL_MS);
    return () => clearInterval(iv);
  }, [audienceFilter, activeId]);

  const patchRow = (id: number, patch: Partial<ConversationRow>) => {
    setRows((current) =>
      current.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

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
    if (activeId === id) {
      setActiveId(null);
      activeRef.current = null;
      return;
    }
    setActiveId(id);
    activeRef.current = id;
    setThread([]);
    setStatus("ai");
    setAgentLabel("");
    setThreadError("");
    lastIdRef.current = 0;
    setThreadLoading(true);
    fetchConversationThread(id, 0)
      .then((payload) => {
        if (activeRef.current !== id) return;
        setThread(payload.messages);
        lastIdRef.current = payload.messages.length
          ? payload.messages[payload.messages.length - 1].id
          : 0;
        setStatus(payload.status);
        setAgentLabel(payload.agent_label);
      })
      .catch((err) => {
        if (activeRef.current === id) setThreadError(err.message);
      })
      .finally(() => {
        if (activeRef.current === id) setThreadLoading(false);
      });
  };

  const closeThread = () => {
    setActiveId(null);
    activeRef.current = null;
  };

  // Poll the open thread every 3s for anything new. `cancelled` is scoped
  // to this effect instance and flips on cleanup — which fires both when
  // `activeId` changes (thread switched/closed) and when the component
  // unmounts, so the interval never outlives the drawer being open.
  useEffect(() => {
    if (activeId === null) return;
    let cancelled = false;
    const iv = setInterval(() => {
      fetchConversationThread(activeId, lastIdRef.current)
        .then((payload) => {
          if (cancelled) return;
          mergeThread(payload.messages);
          setStatus(payload.status);
          setAgentLabel(payload.agent_label);
          patchRow(activeId, {
            status: payload.status,
            human_requested: payload.human_requested,
          });
        })
        .catch(() => {
          // Missed tick — the next one in 3s tries again.
        });
    }, CONVO_THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const handleTakeover = async () => {
    if (activeId === null) return;
    const forId = activeId;
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
    } catch (err) {
      if (activeRef.current === forId) {
        setThreadError((err as Error).message);
      }
    } finally {
      setTakingOver(false);
    }
  };

  const handleRelease = async () => {
    if (activeId === null) return;
    const forId = activeId;
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
    } catch (err) {
      if (activeRef.current === forId) {
        setThreadError((err as Error).message);
      }
    } finally {
      setReleasing(false);
    }
  };

  const handleSend = async () => {
    const trimmed = reply.trim();
    if (!trimmed || activeId === null || sending) return;
    const forId = activeId;
    setSending(true);
    try {
      const payload = await sendConversationMessage(
        forId,
        trimmed,
        lastIdRef.current,
      );
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
    } catch (err) {
      if (activeRef.current === forId) {
        setThreadError((err as Error).message);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Conversations</CardTitle>
            <CardDescription>
              Every help-bot conversation platform-wide — coach console and
              marketing visitor bubble.
            </CardDescription>
          </div>
          <select
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm"
            aria-label="Filter by audience"
          >
            <option value="">All</option>
            <option value="coach">Coaches</option>
            <option value="visitor">Visitors</option>
          </select>
        </CardHeader>
        <CardContent className="space-y-3">
          {listError && <p className="text-sm text-destructive">{listError}</p>}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No conversations yet.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openThread(row.id)}
                  className={`flex w-full items-start gap-3 p-3 text-left text-sm transition-colors hover:bg-accent/40 ${activeId === row.id ? "bg-accent/40" : ""}`}
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
                      <span className="font-medium text-foreground">
                        {row.user_label || "Anonymous"}
                      </span>
                      <Badge variant="outline">{row.audience}</Badge>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {row.tenant_schema}
                      </span>
                      {row.status === "human" && (
                        <Badge variant="brand">Live</Badge>
                      )}
                      {row.human_requested && (
                        <Badge variant="warning">Wants human</Badge>
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {activeId !== null && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card text-card-foreground shadow-2xl">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-lg font-semibold">Conversation</h2>
            <Button variant="ghost" size="icon" onClick={closeThread}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {threadError && (
            <p className="px-4 pt-2 text-sm text-destructive">{threadError}</p>
          )}
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {threadLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              thread.map((message) => {
                if (message.role === "system") {
                  const line = conversationSystemLine(message.content);
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
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                        {message.content}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={message.id} className="flex">
                    <div className="max-w-[90%] space-y-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
                      {message.role === "agent" && agentLabel && (
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {agentLabel}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2 border-t p-3">
            {status === "ai" ? (
              <Button
                size="sm"
                onClick={() => void handleTakeover()}
                loading={takingOver}
              >
                Take over
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
                    placeholder="Reply…"
                    maxLength={2000}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    loading={sending}
                    disabled={!reply.trim()}
                  >
                    Send
                  </Button>
                </form>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRelease()}
                  loading={releasing}
                >
                  Release
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-5 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-3 w-16" />
      </CardContent>
    </Card>
  );
}

export default function AdminAiUsagePage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<AiUsageRollup | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    fetch(`/api/v1/platform/ai-usage/?month=${month}`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load AI usage");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [month]);

  const maxDaily = data
    ? Math.max(1, ...data.daily_questions.map((d) => d.count))
    : 1;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            AI usage
          </h1>
          <p className="text-sm text-muted-foreground">
            Cross-feature spend, kill-switch state, and question volume.
          </p>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="ai-usage-month"
            className="text-xs font-medium text-muted-foreground"
          >
            Month
          </label>
          <Input
            id="ai-usage-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!data && !error && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Feature cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {data.features.map((feature) => {
              const Icon = FEATURE_ICONS[feature.key] ?? Bot;
              return (
                <Card key={feature.key} className="h-full">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {feature.label}
                    </CardTitle>
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-foreground">
                      {feature.count}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ${feature.usd_spent} / ${feature.usd_cap.toFixed(2)} spent
                    </p>
                    {feature.kill_switch_tripped && (
                      <Badge variant="destructive" className="mt-2">
                        Kill switch tripped
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Ratings + sparkline */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ratings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground">
                  👍 {data.ratings.up} · 👎 {data.ratings.down} ·{" "}
                  {data.ratings.unrated} unrated
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preview (coach-testing) transcripts are excluded.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Questions, last 7 days
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.daily_questions.length > 0 ? (
                  <div className="flex items-end gap-2">
                    {data.daily_questions.map((d) => (
                      <div
                        key={d.date}
                        className="flex flex-1 flex-col items-center gap-1"
                        title={`${d.date}: ${d.count}`}
                      >
                        <div className="flex h-16 w-full items-end">
                          <div
                            className="w-full rounded-t bg-primary"
                            style={{
                              height: `${Math.max(4, (d.count / maxDaily) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {d.date.slice(5)}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {d.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No questions recorded in the last 7 days.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <ConversationsSection />

          {/* Top tenants */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top tenants by spend</CardTitle>
            </CardHeader>
            <CardContent>
              {data.top_tenants.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant schema</TableHead>
                      <TableHead className="text-right">USD spent</TableHead>
                      <TableHead className="text-right">Questions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.top_tenants.map((row) => (
                      <TableRow key={row.tenant_schema}>
                        <TableCell className="font-mono text-sm text-foreground">
                          {row.tenant_schema}
                        </TableCell>
                        <TableCell className="text-right">
                          ${row.usd_spent}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {row.count}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AI spend recorded for this month.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Links */}
          <div className="flex flex-wrap gap-4">
            <Link
              href="/admin/m/ai-transcripts"
              className="text-sm font-medium text-primary hover:underline"
            >
              Browse transcripts
            </Link>
            <Link
              href="/admin/m/platform-kb"
              className="text-sm font-medium text-primary hover:underline"
            >
              Edit platform notes
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
