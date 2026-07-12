"use client";

import {
  Archive,
  ArchiveRestore,
  Flag,
  Inbox,
  Loader2,
  Paperclip,
  Trash2,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import type { ConversationListItem } from "@/lib/mailbox";

import type { Folder } from "./folder-rail";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
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

function QuickAction({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent ${
        destructive ? "hover:text-destructive" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function ConversationList({
  items,
  folder,
  loading,
  onOpen,
  onArchive,
  onSpam,
  onDelete,
}: {
  items: ConversationListItem[];
  folder: Folder;
  loading: boolean;
  onOpen: (id: number) => void;
  onArchive: (id: number, archived: boolean) => void;
  onSpam: (id: number, spam: boolean) => void;
  onDelete: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={Inbox} title="Nothing here." className="flex-1" />;
  }

  return (
    <ul className="flex-1 divide-y divide-border overflow-y-auto">
      {items.map((c, i) => {
        const unread = c.unread_count > 0;
        return (
          <li key={c.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(c.id)}
              className={`group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40 ${
                i % 2 === 1 ? "bg-accent/15" : "bg-background"
              }`}
            >
              {unread && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}
                  >
                    {c.counterparty_name || c.counterparty_email}
                  </span>
                  <span
                    className={`truncate text-sm ${
                      unread
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {c.subject || "(no subject)"}
                  </span>
                  {c.last_message_has_attachments && (
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {c.last_message_preview}
                </p>
              </div>

              {/* date ↔ hover actions swap */}
              <span className="shrink-0 text-xs text-muted-foreground group-hover:hidden">
                {relativeTime(c.last_message_at)}
              </span>
              <div className="hidden shrink-0 items-center group-hover:flex">
                {folder === "inbox" ? (
                  <>
                    <QuickAction
                      label="Archive"
                      onClick={() => onArchive(c.id, true)}
                    >
                      <Archive className="h-4 w-4" />
                    </QuickAction>
                    <QuickAction
                      label="Mark as spam"
                      onClick={() => onSpam(c.id, true)}
                    >
                      <Flag className="h-4 w-4" />
                    </QuickAction>
                  </>
                ) : (
                  <QuickAction
                    label="Move to inbox"
                    onClick={() =>
                      folder === "archived"
                        ? onArchive(c.id, false)
                        : onSpam(c.id, false)
                    }
                  >
                    <ArchiveRestore className="h-4 w-4" />
                  </QuickAction>
                )}
                <QuickAction
                  label="Delete"
                  destructive
                  onClick={() => onDelete(c.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </QuickAction>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
