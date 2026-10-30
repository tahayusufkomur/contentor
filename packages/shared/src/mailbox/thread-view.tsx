"use client";

import { useEffect, useRef, useState } from "react";

import { Archive, ArchiveRestore, ArrowLeft, Flag, Trash2 } from "lucide-react";

import type { ConversationDetail, MailboxMessage } from "@/lib/mailbox";

import AttachmentList from "./attachment-list";
import type { Folder } from "./folder-rail";
import MessageEditor, {
  type MessageEditorHandle,
  type OutgoingDraft,
} from "./message-editor";
import { useLocale, useTranslations } from "next-intl";

function HeaderAction({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent ${
        destructive ? "hover:text-destructive" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MessageCard({
  msg,
  index,
  expandedDefault,
}: {
  msg: MailboxMessage;
  index: number;
  expandedDefault: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("studio.mailbox");
  const [expanded, setExpanded] = useState(expandedDefault);
  const isOutbound = msg.direction === "outbound";
  const sender = isOutbound ? t("you") : msg.from_email;
  // Zebra background alternates by position so the thread is easy to scan;
  // a coloured left border still marks who sent each message. accent/15 is used
  // (not muted) because in these themes muted sits ~0.03 lightness from the
  // background and reads as no stripe at all.
  const zebra = index % 2 === 1 ? "bg-accent/15" : "bg-background";
  const accent = isOutbound
    ? "border-l-primary"
    : "border-l-muted-foreground/40";
  const when = new Date(msg.created_at).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!expanded) {
    const snippet = (msg.text || "").replace(/\s+/g, " ").slice(0, 90);
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`w-full rounded-lg border border-l-4 px-4 py-2 text-left transition-colors hover:bg-accent/40 ${accent} ${zebra}`}
      >
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-medium text-foreground">{sender}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {snippet}
          </span>
          <span className="shrink-0 text-muted-foreground">{when}</span>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`rounded-lg border border-l-4 px-4 py-3 ${accent} ${zebra}`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">
          {sender}
          {!isOutbound && (
            <span className="ml-1 font-normal text-muted-foreground">
              &lt;{msg.from_email}&gt;
            </span>
          )}
        </span>
        <span className="text-muted-foreground">{when}</span>
      </div>
      {msg.html ? (
        /* Safe: backend sanitizes HTML server-side (nh3) before serving. */
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: msg.html }}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
      )}
      <AttachmentList attachments={msg.attachments} />
    </div>
  );
}

export default function ThreadView({
  thread,
  folder,
  replySending,
  onBack,
  onReply,
  onArchive,
  onSpam,
  onDelete,
  editorRef,
}: {
  thread: ConversationDetail;
  folder: Folder;
  replySending: boolean;
  onBack: () => void;
  onReply: (draft: OutgoingDraft) => void;
  onArchive: (archived: boolean) => void;
  onSpam: (spam: boolean) => void;
  onDelete: () => void;
  editorRef: React.Ref<MessageEditorHandle>;
}) {
  const t = useTranslations("studio.mailbox");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.messages.length]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <HeaderAction label={t("actions.back")} onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </HeaderAction>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {thread.subject || t("noSubject")}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {thread.counterparty_name
              ? `${thread.counterparty_name} · ${thread.counterparty_email}`
              : thread.counterparty_email}
          </p>
        </div>
        {folder === "inbox" ? (
          <>
            <HeaderAction
              label={t("actions.archive")}
              onClick={() => onArchive(true)}
            >
              <Archive className="h-4 w-4" />
            </HeaderAction>
            <HeaderAction
              label={t("actions.spam")}
              onClick={() => onSpam(true)}
            >
              <Flag className="h-4 w-4" />
            </HeaderAction>
          </>
        ) : (
          <HeaderAction
            label={t("actions.moveToInbox")}
            onClick={() =>
              folder === "archived" ? onArchive(false) : onSpam(false)
            }
          >
            <ArchiveRestore className="h-4 w-4" />
          </HeaderAction>
        )}
        <HeaderAction
          label={t("actions.delete")}
          destructive
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </HeaderAction>
      </div>

      {/* Messages — older collapsed, latest expanded */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {thread.messages.map((msg, i) => (
          <MessageCard
            key={msg.id}
            msg={msg}
            index={i}
            expandedDefault={i === thread.messages.length - 1}
          />
        ))}
        <div ref={endRef} />
      </div>

      {/* Reply */}
      <div className="border-t px-4 py-3">
        <MessageEditor
          ref={editorRef}
          compact
          placeholder={t("editor.replyPlaceholder")}
          sending={replySending}
          onSend={onReply}
        />
      </div>
    </div>
  );
}
