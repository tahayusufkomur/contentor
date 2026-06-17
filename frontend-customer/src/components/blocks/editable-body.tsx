"use client";

import { cn } from "@/lib/utils";
import { RichHtml } from "./rich-html";
import type { EditableContext } from "@/lib/blocks/types";

interface EditableBodyProps {
  value?: string;
  field: string;
  editable?: EditableContext;
  className?: string;
  placeholder?: string;
}

/** Renders a block's rich-text body. On the public site it's read-only
 *  (sanitized HTML). In edit mode, clicking it opens the centered rich-text
 *  modal. The `data-rich-body` marker lets the canvas shell pass the click
 *  through (instead of just selecting the block). */
export function EditableBody({
  value,
  field,
  editable,
  className,
  placeholder,
}: EditableBodyProps) {
  const openEditor = editable?.onEditRichText;
  if (!openEditor) {
    return <RichHtml html={value} className={className} />;
  }

  return (
    <div
      data-rich-body="true"
      role="button"
      tabIndex={0}
      title="Click to edit text"
      onClick={() => openEditor(field, value || "")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openEditor(field, value || "");
        }
      }}
      className={cn(
        "cursor-text rounded-sm ring-offset-2 transition hover:ring-2 hover:ring-primary/40",
        className,
      )}
    >
      {value ? (
        <RichHtml html={value} />
      ) : (
        <span className="text-muted-foreground/60">
          {placeholder || "Click to add text"}
        </span>
      )}
    </div>
  );
}
