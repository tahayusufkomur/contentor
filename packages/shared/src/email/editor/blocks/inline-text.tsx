"use client";

import { createElement, useEffect, useRef, type CSSProperties } from "react";

import { cn } from "../../../lib/utils";

type Tag = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";

/** A block's plain text, typed straight onto the canvas like the site editor's
 *  inline text: uncontrolled (React never rewrites it per keystroke, so the
 *  caret stays put) and synced from `value` only when it changes from outside
 *  (undo, the settings panel, the Designer). Enter leaves the field. */
export function InlineText({
  value,
  onChange,
  as = "span",
  placeholder,
  style,
  className,
  label,
}: {
  value: string;
  onChange: (text: string) => void;
  as?: Tag;
  placeholder?: string;
  style?: CSSProperties;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== (value ?? "")) el.textContent = value ?? "";
  }, [value]);

  return createElement(as, {
    ref,
    "data-inline-editable": "true",
    "data-placeholder": placeholder ?? "",
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    role: "textbox",
    "aria-label": label ?? placeholder ?? "Text",
    style,
    className: cn(
      "cursor-text rounded-sm outline-none focus:ring-2 focus:ring-primary/40",
      "empty:before:opacity-50 empty:before:content-[attr(data-placeholder)]",
      className,
    ),
    onInput: (e: React.FormEvent<HTMLElement>) =>
      onChange(e.currentTarget.textContent ?? ""),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    onPaste: (e: React.ClipboardEvent<HTMLElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain").replace(/\s+/g, " ");
      document.execCommand("insertText", false, text);
    },
  });
}
