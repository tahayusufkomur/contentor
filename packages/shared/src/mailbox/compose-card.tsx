"use client";

import { useRef, useState } from "react";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { compose } from "@/lib/mailbox";
import { useAsyncAction } from "../hooks/use-async-action";

import MessageEditor, {
  type MessageEditorHandle,
  type OutgoingDraft,
} from "./message-editor";

export default function ComposeCard({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (conversationId: number) => void;
}) {
  const t = useTranslations("studio.mailbox");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const editorRef = useRef<MessageEditorHandle>(null);

  const { run: send, loading: sending } = useAsyncAction(
    async (draft: OutgoingDraft) => {
      if (!to.trim()) {
        toast.error(t("compose.addRecipient"));
        return;
      }
      const res = await compose({
        to: to.trim(),
        subject: subject.trim(),
        text: draft.text,
        html: draft.html,
        attachment_ids: draft.attachmentIds,
      });
      toast.success(t("compose.sent"));
      onSent(res.conversation_id);
    },
    { errorToast: t("compose.sendFailed") },
  );

  return (
    <div className="fixed bottom-4 right-4 z-[120] flex w-[min(480px,calc(100vw-2rem))] flex-col rounded-xl border bg-background shadow-2xl">
      <div className="flex items-center justify-between rounded-t-xl bg-muted/60 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{t("compose.title")}</h2>
        <button
          type="button"
          aria-label={t("actions.close")}
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2 px-4 pt-3">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={t("compose.to")}
          className="w-full border-b border-input bg-transparent px-1 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("compose.subject")}
          className="w-full border-b border-input bg-transparent px-1 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>
      <div className="p-3">
        <MessageEditor
          ref={editorRef}
          autoFocus
          sending={sending}
          onSend={send}
        />
      </div>
    </div>
  );
}
