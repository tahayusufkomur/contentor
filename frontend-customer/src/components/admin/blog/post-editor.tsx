"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, Link2, List } from "lucide-react";

function ToolbarButton({
  active,
  label,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  disabled: boolean;
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
      className={`rounded-md p-1.5 transition-colors disabled:pointer-events-none disabled:opacity-50 ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function setLink(editor: Editor, promptText: string) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt(promptText, prev || "https://");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

interface PostEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** Being written for her (focus mode's post job): shown as it types in, not editable. */
  readOnly?: boolean;
}

export function PostEditor({
  value,
  onChange,
  readOnly = false,
}: PostEditorProps) {
  const t = useTranslations("admin.blog.editor");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: t("placeholder") }),
    ],
    content: value,
    // Only her edits: never a change while it is being written for her.
    onUpdate: ({ editor }) => {
      if (editor.isEditable) onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3 min-h-[400px]",
      },
    },
    immediatelyRender: false,
  });
  // A value from outside (the post job typing in, a reload, Regenerate) is
  // shown, outside her undo history (one Ctrl+Z must not erase the job's
  // text); her own keystrokes come back as the editor's HTML and are left alone.
  useEffect(() => {
    if (editor && value !== editor.getHTML())
      editor
        .chain()
        .setMeta("addToHistory", false)
        .setContent(value, false)
        .run();
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!readOnly, false); // no update: it is not her edit
  }, [editor, readOnly]);

  if (!editor) return null;

  return (
    <div className="rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring">
      <Toolbar editor={editor} disabled={readOnly} />
      <EditorContent editor={editor} />
    </div>
  );
}

/** The formatting buttons; off while the post is being written for her
 *  (TipTap's commands run even when the editor is not editable). */
export function Toolbar({
  editor,
  disabled,
}: {
  editor: Editor;
  disabled: boolean;
}) {
  const t = useTranslations("admin.blog.editor");
  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1">
      <ToolbarButton
        disabled={disabled}
        label={t("bold")}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        label={t("italic")}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton
        disabled={disabled}
        label={t("heading2")}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        label={t("heading3")}
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton
        disabled={disabled}
        label={t("bulletList")}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        label={t("link")}
        active={editor.isActive("link")}
        onClick={() => setLink(editor, t("linkUrl"))}
      >
        <Link2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
