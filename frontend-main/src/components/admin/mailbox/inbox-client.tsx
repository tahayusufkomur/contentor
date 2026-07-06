"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  deleteConversation,
  getConversation,
  listConversations,
  reply,
  updateConversation,
} from "@/lib/platform-mailbox-api";
import type {
  ConversationDetail,
  ConversationListItem,
} from "@/lib/platform-mailbox-api";

import ComposeCard from "./compose-card";
import ConversationList from "./conversation-list";
import FolderRail, { type Folder } from "./folder-rail";
import type { MessageEditorHandle, OutgoingDraft } from "./message-editor";
import ThreadView from "./thread-view";

// ── Delete confirm dialog ───────────────────────────────────────────────────

interface DeleteConfirmProps {
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}

function DeleteConfirmDialog({
  onCancel,
  onConfirm,
  loading,
}: DeleteConfirmProps) {
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
              This removes the entire thread. You can&apos;t undo this.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              loading={loading}
              onClick={onConfirm}
            >
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
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [query, setQuery] = useState("");
  const [thread, setThread] = useState<ConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const replyEditorRef = useRef<MessageEditorHandle>(null);
  // Mirror live state the polling interval reads, so the interval callback
  // stays stable (created once) yet always sees the current thread + send state.
  const liveRef = useRef({
    threadId: null as number | null,
    replySending: false,
  });
  liveRef.current = { threadId: thread?.id ?? null, replySending };

  const loadList = async () => {
    try {
      setConversations(await listConversations());
    } catch {
      toast.error("Could not load conversations.");
    }
  };

  useEffect(() => {
    setLoading(true);
    listConversations()
      .then((list) => setConversations(list))
      .catch(() => toast.error("Could not load inbox."))
      .finally(() => setLoading(false));
  }, []);

  // Live updates: silently poll the list, and the open thread, every 15s.
  // Skips while a reply is sending, and ignores transient errors (no toast).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const { threadId, replySending: sending } = liveRef.current;
      if (sending) return;
      try {
        const list = await listConversations();
        if (!cancelled) setConversations(list);
        if (threadId !== null && !liveRef.current.replySending) {
          const detail = await getConversation(threadId);
          // Only apply if the user hasn't switched threads meanwhile.
          if (!cancelled && liveRef.current.threadId === threadId)
            setThread(detail);
        }
      } catch {
        // transient — try again next tick
      }
    };
    const timer = setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const visible = useMemo(() => {
    const byFolder = conversations.filter((c) =>
      folder === "inbox"
        ? !c.is_archived && !c.is_spam
        : folder === "archived"
          ? c.is_archived
          : c.is_spam,
    );
    const q = query.trim().toLowerCase();
    if (!q) return byFolder;
    return byFolder.filter((c) =>
      [
        c.counterparty_name,
        c.counterparty_email,
        c.student_name,
        c.student_email,
        c.subject,
        c.last_message_preview,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [conversations, folder, query]);

  const openConversation = async (id: number) => {
    setThreadLoading(true);
    try {
      setThread(await getConversation(id));
      await loadList();
    } catch {
      toast.error("Could not load this conversation.");
    } finally {
      setThreadLoading(false);
    }
  };

  const sendReply = async (draft: OutgoingDraft) => {
    if (!thread) return;
    setReplySending(true);
    try {
      await reply(thread.id, {
        text: draft.text,
        html: draft.html,
        attachment_ids: draft.attachmentIds,
      });
      replyEditorRef.current?.clear();
      setThread(await getConversation(thread.id));
      toast.success("Reply sent.");
    } catch {
      toast.error("Could not send reply. Please try again.");
    } finally {
      setReplySending(false);
    }
  };

  const patchConversation = async (
    id: number,
    patch: { is_archived?: boolean; is_spam?: boolean },
    doneMsg: string,
  ) => {
    try {
      await updateConversation(id, patch);
      toast.success(doneMsg);
      if (thread?.id === id) setThread(null);
      await loadList();
    } catch {
      toast.error("Could not update. Please try again.");
    }
  };

  const doDelete = async () => {
    if (deletingId === null) return;
    setDeleteLoading(true);
    try {
      await deleteConversation(deletingId);
      toast.success("Conversation deleted.");
      if (thread?.id === deletingId) setThread(null);
      setDeletingId(null);
      await loadList();
    } catch {
      toast.error("Could not delete. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <FolderRail
          folder={folder}
          onSelect={(f) => {
            setFolder(f);
            setThread(null);
          }}
          onCompose={() => setComposeOpen(true)}
        />

        {thread || threadLoading ? (
          threadLoading || !thread ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : (
            <ThreadView
              thread={thread}
              folder={folder}
              replySending={replySending}
              editorRef={replyEditorRef}
              onBack={() => setThread(null)}
              onReply={sendReply}
              onArchive={(v) =>
                patchConversation(
                  thread.id,
                  { is_archived: v },
                  v ? "Conversation archived." : "Moved to inbox.",
                )
              }
              onSpam={(v) =>
                patchConversation(
                  thread.id,
                  { is_spam: v },
                  v ? "Marked as spam." : "Moved to inbox.",
                )
              }
              onDelete={() => setDeletingId(thread.id)}
            />
          )
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search mail"
                className="w-full bg-transparent py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <ConversationList
              items={visible}
              folder={folder}
              loading={loading}
              onOpen={openConversation}
              onArchive={(id, v) =>
                patchConversation(
                  id,
                  { is_archived: v },
                  v ? "Conversation archived." : "Moved to inbox.",
                )
              }
              onSpam={(id, v) =>
                patchConversation(
                  id,
                  { is_spam: v },
                  v ? "Marked as spam." : "Moved to inbox.",
                )
              }
              onDelete={(id) => setDeletingId(id)}
            />
          </div>
        )}
      </div>

      {composeOpen && (
        <ComposeCard
          onClose={() => setComposeOpen(false)}
          onSent={async (conversationId) => {
            setComposeOpen(false);
            setFolder("inbox");
            await loadList();
            await openConversation(conversationId);
          }}
        />
      )}

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
