"use client";

import { useRef, useState } from "react";

import { X } from "lucide-react";
import { toast } from "sonner";

import { compose } from "@/lib/mailbox";

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
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const editorRef = useRef<MessageEditorHandle>(null);

  const send = async (draft: OutgoingDraft) => {
    if (!to.trim()) {
      toast.error("Add a recipient first.");
      return;
    }
    setSending(true);
    try {
      const res = await compose({
        to: to.trim(),
        subject: subject.trim(),
        text: draft.text,
        html: draft.html,
        attachment_ids: draft.attachmentIds,
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
    <div className="fixed bottom-4 right-4 z-[120] flex w-[min(480px,calc(100vw-2rem))] flex-col rounded-xl border bg-background shadow-2xl">
      <div className="flex items-center justify-between rounded-t-xl bg-muted/60 px-4 py-2.5">
        <h2 className="text-sm font-semibold">New message</h2>
        <button
          type="button"
          aria-label="Close"
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
          placeholder="To"
          className="w-full border-b border-input bg-transparent px-1 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full border-b border-input bg-transparent px-1 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>
      <div className="p-3">
        <MessageEditor ref={editorRef} autoFocus sending={sending} onSend={send} />
      </div>
    </div>
  );
}
