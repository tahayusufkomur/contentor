"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GripVertical, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "./editor-store";
import { useBlockLibrary } from "@/lib/blocks/use-block-library";
import type { Block, PageKey } from "@/types/tenant";

interface BlockToolbarProps {
  block: Block;
  pageKey: PageKey;
  selected: boolean;
  /** dnd-kit activator ref + listeners for the drag handle. */
  dragHandleRef?: (el: HTMLElement | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: Record<string, any>;
}

/** Floating action bar pinned to a block's top-right while editing. Visible on
 *  hover or when the block is selected. */
export function BlockToolbar({
  block,
  pageKey,
  selected,
  dragHandleRef,
  dragHandleProps,
}: BlockToolbarProps) {
  const tr = useTranslations("admin.owner.toolbar");
  const store = useEditorStore();
  const library = useBlockLibrary();
  const [confirming, setConfirming] = useState(false);
  const label = library.def(block.type)?.label ?? block.type;

  const btn =
    "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <div
      data-block-toolbar="true"
      className={cn(
        "absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-lg border bg-background/95 px-1 py-1 shadow-md backdrop-blur",
        "opacity-0 transition-opacity duration-150 group-hover/block:opacity-100",
        selected && "opacity-100",
      )}
      // Don't let toolbar clicks bubble to the block's select-on-click handler.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={dragHandleRef}
        {...dragHandleProps}
        type="button"
        className={cn(btn, "cursor-grab active:cursor-grabbing")}
        title={tr("drag")}
        aria-label={tr("reorder", { label })}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="px-1 text-xs font-medium text-foreground">{label}</span>

      {confirming ? (
        <>
          <button
            type="button"
            onClick={() => store.removeBlock(pageKey, block.id)}
            className={cn(
              btn,
              "text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
            title={tr("confirmDelete")}
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={btn}
            title={tr("cancel")}
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={cn(btn, "hover:bg-destructive/10 hover:text-destructive")}
          title={tr("delete")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
