"use client";

import { useEffect, useRef, createElement } from "react";
import { cn } from "@/lib/utils";
import type { EditableContext } from "@/lib/blocks/types";

type Tag = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";

interface InlineTextProps {
  value: string;
  /** Block field this text maps to (e.g. "heading"). */
  field: string;
  editable?: EditableContext;
  as?: Tag;
  className?: string;
  placeholder?: string;
}

/** Renders a block's text. On the public site (no `editable`) it's a plain,
 *  read-only element — byte-identical to before. In edit mode it becomes a
 *  plain-text `contentEditable` whose edits flow to the store. Uncontrolled by
 *  design: React never rewrites the text on each keystroke (which would reset
 *  the caret); it only syncs the DOM when `value` changes from outside (undo,
 *  redo, applying a template). No rich text — the data stays a plain string. */
export function InlineText({
  value,
  field,
  editable,
  as = "span",
  className,
  placeholder,
}: InlineTextProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!editable) return;
    const el = ref.current;
    if (el && el.textContent !== (value ?? "")) {
      el.textContent = value ?? "";
    }
  }, [value, editable]);

  if (!editable) {
    // Public site: plain text, never a placeholder.
    return createElement(as, { className }, value || null);
  }

  return createElement(as, {
    ref,
    "data-inline-editable": "true",
    "data-placeholder": placeholder ?? "",
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    role: "textbox",
    "aria-label": field,
    className: cn(
      "cursor-text rounded-sm outline-none focus:ring-2 focus:ring-primary/40",
      "empty:before:text-muted-foreground/50 empty:before:content-[attr(data-placeholder)]",
      className,
    ),
    onInput: (e: React.FormEvent<HTMLElement>) =>
      editable.onTextChange(field, e.currentTarget.textContent ?? ""),
    onPaste: (e: React.ClipboardEvent<HTMLElement>) => {
      // Plain-text paste only — keep the stored value a clean string.
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    },
  });
}
