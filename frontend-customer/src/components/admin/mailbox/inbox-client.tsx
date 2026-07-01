"use client";

import { useEffect, useRef, useState } from "react";

import {
  AlertTriangle,
  Archive,
  Flag,
  Inbox,
  Loader2,
  MoreHorizontal,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Textarea } from "@/components/ui/textarea";
import {
  compose,
  deleteConversation,
  getConversation,
  getSettings,
  listConversations,
  reply,
  updateConversation,
} from "@/lib/mailbox";
import type {
  ConversationDetail,
  ConversationListItem,
  MailboxSettings,
} from "@/lib/mailbox";

// ── helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ── Compose dialog ─────────────────────────────────────────────────────────

interface ComposeDialogProps {
  onClose: () => void;
  onSent: (conversationId: number) => void;
}

function ComposeDialog({ onClose, onSent }: ComposeDialogProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!to.trim() || !subject.trim() || !text.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }
    setSending(true);
    try {
      const res = await compose({
        to: to.trim(),
        subject: subject.trim(),
        text: text.trim(),
      });
      toast.success("Message sent.");
      onSent(res.conversation_id);
    } catch {
      toast.error("Could not send the message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="flex w-full max-w-lg flex-col rounded-xl border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">New message</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-3 p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                To
              </label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="student@example.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's this about?"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Message
              </label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write your message…"
                rows={5}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t px-5 py-3.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" loading={sending} onClick={send}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ── Delete confirm dialog ───────────────────────────────────────────────────

interface DeleteConfirmProps {
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}

function DeleteConfirmDialog({ onCancel, onConfirm, loading }: DeleteConfirmProps) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4"
        onClick={onCancel}
      >
        <div
          className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-background p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Delete conversation?</h2>
            <p className="text-sm text-muted-foreground">
              This removes the entire thread. You can't undo this.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" loading={loading} onClick={onConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ── Main inbox component ───────────────────────────────────────────────────

export default function InboxClient() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [settings, setSettings] = useState<MailboxSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [thread, setThread] = useState<ConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // ── data fetching ──────────────────────────────────────────────────────

  const loadList = async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } catch {
      toast.error("Could not load conversations.");
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([listConversations(), getSettings()])
      .then(([list, s]) => {
        setConversations(list);
        setSettings(s);
      })
      .catch(() => {
        toast.error("Could not load inbox.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Scroll to latest message when thread changes
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  // ── select a conversation ──────────────────────────────────────────────

  const selectConversation = async (id: number) => {
    setSelectedId(id);
    setThreadLoading(true);
    setReplyText("");
    try {
      const detail = await getConversation(id);
      setThread(detail);
      // Re-fetch list so unread badge clears (server marks as read on GET)
      await loadList();
    } catch {
      toast.error("Could not load this conversation.");
    } finally {
      setThreadLoading(false);
    }
  };

  // ── reply ──────────────────────────────────────────────────────────────

  const sendReply = async () => {
    if (!thread || !replyText.trim()) return;
    setReplySending(true);
    try {
      await reply(thread.id, replyText.trim());
      setReplyText("");
      const detail = await getConversation(thread.id);
      setThread(detail);
      toast.success("Reply sent.");
    } catch {
      toast.error("Could not send reply. Please try again.");
    } finally {
      setReplySending(false);
    }
  };

  // ── compose new ────────────────────────────────────────────────────────

  const handleComposeSent = async (conversationId: number) => {
    setComposeOpen(false);
    await loadList();
    await selectConversation(conversationId);
  };

  // ── overflow actions ────────────────────────────────────────────────────

  const archiveConversation = async (id: number) => {
    try {
      await updateConversation(id, { is_archived: true });
      toast.success("Conversation archived.");
      if (selectedId === id) {
        setSelectedId(null);
        setThread(null);
      }
      await loadList();
    } catch {
      toast.error("Could not archive. Please try again.");
    }
  };

  const markSpam = async (id: number) => {
    try {
      await updateConversation(id, { is_spam: true });
      toast.success("Marked as spam.");
      if (selectedId === id) {
        setSelectedId(null);
        setThread(null);
      }
      await loadList();
    } catch {
      toast.error("Could not mark as spam. Please try again.");
    }
  };

  const confirmDelete = (id: number) => setDeletingId(id);

  const doDelete = async () => {
    if (deletingId === null) return;
    setDeleteLoading(true);
    try {
      await deleteConversation(deletingId);
      toast.success("Conversation deleted.");
      if (selectedId === deletingId) {
        setSelectedId(null);
        setThread(null);
      }
      setDeletingId(null);
      await loadList();
    } catch {
      toast.error("Could not delete. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────

  const canReceive = settings?.can_receive ?? true;

  return (
    <div className="flex h-full flex-col gap-0">
      {/* Upsell banner — shown when the mailbox is send-only (no custom domain) */}
      {settings && !canReceive && !bannerDismissed && (
        <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">
            Add a custom domain to receive replies from your students.
          </span>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between px-4 py-4">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          <Send className="h-4 w-4" />
          New message
        </Button>
      </div>

      {/* Two-pane layout */}
      <div className="flex min-h-0 flex-1 border-t">
        {/* ── Left pane: conversation list ── */}
        <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No conversations yet."
              className="flex-1"
            />
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => (
                <li key={c.id}>
                  <div className="group relative flex cursor-pointer items-start gap-2 px-3 py-3 hover:bg-accent/50">
                    {/* Clickable row area */}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => selectConversation(c.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm ${c.unread_count > 0 ? "font-semibold" : "font-medium"}`}
                        >
                          {c.counterparty_name || c.counterparty_email}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {relativeTime(c.last_message_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.subject}
                      </p>
                      {c.unread_count > 0 && (
                        <Badge variant="default" className="mt-1 text-[10px]">
                          {c.unread_count}
                        </Badge>
                      )}
                    </button>

                    {/* Per-row overflow menu */}
                    <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => archiveConversation(c.id)}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => markSpam(c.id)}>
                            <Flag className="mr-2 h-4 w-4" />
                            Mark as spam
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => confirmDelete(c.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Right pane: thread ── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {threadLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !thread ? (
            <EmptyState
              icon={Inbox}
              title="Select a conversation"
              description="Pick a conversation from the list to read it."
              className="flex-1"
            />
          ) : (
            <>
              {/* Thread header */}
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">{thread.subject}</h2>
                <p className="text-xs text-muted-foreground">
                  {thread.counterparty_name
                    ? `${thread.counterparty_name} · ${thread.counterparty_email}`
                    : thread.counterparty_email}
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-4">
                  {thread.messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                            isOutbound
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {msg.html ? (
                            /* Safe: the backend sanitizes HTML server-side using nh3
                               before storing it, so we can render it directly here. */
                            <div
                              className="prose prose-sm max-w-none dark:prose-invert"
                              dangerouslySetInnerHTML={{ __html: msg.html }}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          )}
                          <p
                            className={`mt-1 text-right text-[10px] ${isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"}`}
                          >
                            {new Date(msg.created_at).toLocaleTimeString(
                              undefined,
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                            &nbsp;·&nbsp;
                            {new Date(msg.created_at).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>
              </div>

              {/* Reply box */}
              <div className="border-t px-4 py-3">
                <div className="flex gap-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply…"
                    rows={2}
                    className="flex-1 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        sendReply();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    loading={replySending}
                    disabled={!replyText.trim()}
                    onClick={sendReply}
                    className="self-end"
                    title="Send reply (Ctrl+Enter)"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compose dialog */}
      {composeOpen && (
        <ComposeDialog
          onClose={() => setComposeOpen(false)}
          onSent={handleComposeSent}
        />
      )}

      {/* Delete confirm dialog */}
      {deletingId !== null && (
        <DeleteConfirmDialog
          onCancel={() => setDeletingId(null)}
          onConfirm={doDelete}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
