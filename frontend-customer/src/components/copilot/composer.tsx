"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { docToMessage, type TipTapNode } from "@/lib/copilot/composer";
import {
  MAX_ATTACHED,
  MAX_ATTACH_BYTES,
  uploadCopilotPhoto,
} from "@/lib/copilot/upload";
import type { AttachedPhoto } from "@/lib/copilot/types";

/** Rich composer for the copilot drawer: paragraphs, bold/italic, bullet
 * lists (the `* `/`- ` input rule comes with StarterKit), photo attachments.
 * Enter sends, Shift+Enter breaks a line — the chat-app convention. Content
 * leaves as plain markdown via docToMessage; the 2000-char backend cap is
 * enforced server-side. */
export function CopilotComposer({
  onSend,
  sending,
  attached,
  onAttach,
  onRemoveAttachment,
}: {
  onSend: (message: string) => void;
  sending: boolean;
  attached: AttachedPhoto[];
  onAttach: (photo: AttachedPhoto) => void;
  onRemoveAttachment: (id: string) => void;
}) {
  const t = useTranslations("student.copilot");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        orderedList: false,
        strike: false,
      }),
      Placeholder.configure({ placeholder: t("placeholder") }),
    ],
    editorProps: {
      attributes: {
        class:
          "copilot-composer max-h-32 min-h-[2.25rem] overflow-y-auto px-2 py-1.5 text-sm focus:outline-none",
        "data-testid": "copilot-input",
      },
    },
  });

  const send = useCallback(() => {
    if (!editor || sending) return;
    const message = docToMessage(editor.getJSON() as TipTapNode);
    if (!message && attached.length === 0) return;
    editor.commands.clearContent();
    onSend(message);
  }, [editor, sending, attached.length, onSend]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const room = MAX_ATTACHED - attached.length;
      const images = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, room);
      if (images.length === 0) return;
      if (images.some((f) => f.size > MAX_ATTACH_BYTES)) {
        toast.error(t("attachTooLarge"));
        return;
      }
      setUploading(true);
      try {
        for (const file of images) {
          onAttach(await uploadCopilotPhoto(file));
        }
      } catch {
        toast.error(t("attachFailed"));
      } finally {
        setUploading(false);
      }
    },
    [attached.length, onAttach, t],
  );

  if (!editor) return null;

  return (
    <div className="border-t">
      {attached.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {attached.map((p) => (
            <span
              key={p.id}
              className="relative inline-flex items-center gap-1 rounded-lg border p-1"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.signed_url}
                alt={p.title}
                className="size-10 rounded-md object-cover"
              />
              <button
                type="button"
                aria-label={t("removeAttachment")}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onRemoveAttachment(p.id)}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div
        className="m-3 mt-2 rounded-lg border bg-background"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.files ?? []);
          if (files.length > 0) {
            e.preventDefault();
            void uploadFiles(files);
          }
        }}
      >
        <EditorContent editor={editor} />
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              aria-label={t("attach")}
              title={t("attach")}
              disabled={uploading || attached.length >= MAX_ATTACHED}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Spinner className="size-4" />
              ) : (
                <ImagePlus className="size-4" aria-hidden />
              )}
            </button>
          </span>
          <Button
            size="sm"
            onClick={send}
            loading={sending}
            loadingText={t("sending")}
            data-testid="copilot-send"
          >
            {t("send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
