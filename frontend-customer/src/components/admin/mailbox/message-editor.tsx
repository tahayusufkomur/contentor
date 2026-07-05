"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Quote,
  Send,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadAttachment } from "@/lib/mailbox";
import type { MessageAttachment } from "@/lib/mailbox";

export interface OutgoingDraft {
  text: string;
  html: string;
  attachmentIds: number[];
}

export interface MessageEditorHandle {
  clear: () => void;
  isEmpty: () => boolean;
}

interface MessageEditorProps {
  placeholder?: string;
  autoFocus?: boolean;
  sending: boolean;
  onSend: (draft: OutgoingDraft) => void;
  compact?: boolean;
}

const MAX_FILES = 4;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function setLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL", prev || "https://");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

const MessageEditor = forwardRef<MessageEditorHandle, MessageEditorProps>(
  function MessageEditor(
    {
      placeholder = "Write your message…",
      autoFocus,
      sending,
      onSend,
      compact,
    },
    ref,
  ) {
    const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        Placeholder.configure({ placeholder }),
      ],
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: {
          class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 ${
            compact ? "min-h-[72px]" : "min-h-[140px]"
          }`,
        },
      },
      immediatelyRender: false,
    });

    useImperativeHandle(ref, () => ({
      clear: () => {
        editor?.commands.clearContent(true);
        setAttachments([]);
      },
      isEmpty: () =>
        !editor || (editor.getText().trim() === "" && attachments.length === 0),
    }));

    const pickFiles = async (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (attachments.length >= MAX_FILES) {
          toast.error(`At most ${MAX_FILES} attachments per message.`);
          break;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is larger than 10 MB.`);
          continue;
        }
        setUploading(true);
        try {
          const att = await uploadAttachment(file);
          setAttachments((prev) => [...prev, att]);
        } catch {
          toast.error(`Could not upload ${file.name}.`);
        } finally {
          setUploading(false);
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const send = () => {
      if (!editor) return;
      const text = editor.getText().trim();
      if (!text && attachments.length === 0) return;
      onSend({
        text: text || "(attachment)",
        html: editor.getHTML(),
        attachmentIds: attachments.map((a) => a.id),
      });
    };

    if (!editor) return null;

    return (
      <div className="rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 border-b px-2 py-1">
          <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            label="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Link"
            active={editor.isActive("link")}
            onClick={() => setLink(editor)}
          >
            <Link2 className="h-4 w-4" />
          </ToolbarButton>
          <div className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton
            label="Attach files"
            disabled={uploading || attachments.length >= MAX_FILES}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => pickFiles(e.target.files)}
          />
        </div>

        {/* Editable area — Ctrl/Cmd+Enter sends */}
        <div
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t px-3 py-2">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[160px] truncate">{a.filename}</span>
                <span className="text-muted-foreground">
                  {humanSize(a.size)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${a.filename}`}
                  onClick={() =>
                    setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                  }
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Send row */}
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
          <span className="mr-auto text-[11px] text-muted-foreground">
            Ctrl+Enter to send
          </span>
          <Button
            size="sm"
            loading={sending}
            disabled={uploading}
            onClick={send}
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    );
  },
);

export default MessageEditor;
