"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AtSign,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "../../../lib/utils";
import { useEmailEditor } from "../store";
import { variablesIn } from "../tree";
import type { TextBlock } from "../types";
import { padCss } from "./helpers";

// Email-safe rich text: paragraphs, bold/italic/underline, links and lists.
const EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    codeBlock: false,
    code: false,
    blockquote: false,
    horizontalRule: false,
    strike: false,
  }),
  Underline,
  Link.configure({ openOnClick: false, autolink: false }),
  Placeholder.configure({ placeholder: "Write something…" }),
];

/** Text the renderer gives paragraphs, links and lists (see _normalize_text_html). */
const PROSE =
  "outline-none [&_p]:mb-[1em] [&_p:last-child]:mb-0 [&_a]:underline [&_ul]:mb-[1em] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-[1em] [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:opacity-50 [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]";

export function TextView({
  block,
  selected,
}: {
  block: TextBlock;
  selected: boolean;
}) {
  const store = useEmailEditor();
  const settings = store.resolved.settings;
  const update = useRef(store.update);
  update.current = store.update;

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: block.data.html,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: PROSE, "data-inline-editable": "true" },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      update.current(block.id, {
        data: { html, variables: variablesIn(html) },
      });
    },
  });

  // Undo, the Designer or a sync changed the text without the editor: show it,
  // without an update event (it would come back as a new edit).
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.getHTML() !== block.data.html) {
      editor.commands.setContent(block.data.html, false);
    }
  }, [editor, block.data.html]);

  const s = block.style;
  const fontSize = s.fontSize ?? settings.defaultFontSize;
  return (
    <div
      className="relative"
      style={{
        padding: padCss(s.padding),
        textAlign: s.alignment ?? "left",
        backgroundColor: s.backgroundColor ?? undefined,
        fontFamily: settings.defaultFont,
        fontSize,
        lineHeight: `${Math.round(fontSize * (s.lineHeight ?? 1.6))}px`,
        color: s.color || settings.defaultColor,
      }}
    >
      {selected && editor && <FormatBar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

const tool =
  "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

function FormatBar({ editor }: { editor: Editor }) {
  const store = useEmailEditor();
  const button = (
    label: string,
    icon: React.ReactNode,
    run: () => void,
    active?: boolean,
  ) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Keep the text selection: the toolbar must not take focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(tool, active && "bg-accent text-foreground")}
    >
      {icon}
    </button>
  );

  async function link() {
    const current =
      (editor.getAttributes("link").href as string | undefined) ?? "";
    const href = await store.pickLink(current);
    if (href === null) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href === "") chain.unsetLink().run();
    else chain.setLink({ href }).run();
  }

  return (
    <div
      data-block-toolbar="true"
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-full left-1 z-30 mb-1 flex items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 font-sans shadow-md backdrop-blur"
    >
      {button(
        "Bold",
        <Bold className="h-4 w-4" />,
        () => editor.chain().focus().toggleBold().run(),
        editor.isActive("bold"),
      )}
      {button(
        "Italic",
        <Italic className="h-4 w-4" />,
        () => editor.chain().focus().toggleItalic().run(),
        editor.isActive("italic"),
      )}
      {button(
        "Underline",
        <UnderlineIcon className="h-4 w-4" />,
        () => editor.chain().focus().toggleUnderline().run(),
        editor.isActive("underline"),
      )}
      {button(
        "Link",
        <Link2 className="h-4 w-4" />,
        () => void link(),
        editor.isActive("link"),
      )}
      <span className="mx-0.5 h-5 w-px bg-border" />
      {button(
        "Bulleted list",
        <List className="h-4 w-4" />,
        () => editor.chain().focus().toggleBulletList().run(),
        editor.isActive("bulletList"),
      )}
      {button(
        "Numbered list",
        <ListOrdered className="h-4 w-4" />,
        () => editor.chain().focus().toggleOrderedList().run(),
        editor.isActive("orderedList"),
      )}
      <span className="mx-0.5 h-5 w-px bg-border" />
      {button("Insert first name", <AtSign className="h-4 w-4" />, () =>
        editor.chain().focus().insertContent("{{FirstName}}").run(),
      )}
    </div>
  );
}
