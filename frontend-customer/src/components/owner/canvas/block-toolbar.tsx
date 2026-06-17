"use client";

import { useState } from "react";
import { GripVertical, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "./editor-store";
import { getBlockDef } from "@/lib/blocks/registry";
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
  const store = useEditorStore();
  const [confirming, setConfirming] = useState(false);
  const label = getBlockDef(block.type)?.label ?? block.type;

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
        title="Drag to reorder"
        aria-label={`Reorder ${label} block`}
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
            title="Confirm delete"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={btn}
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={cn(btn, "hover:bg-destructive/10 hover:text-destructive")}
          title="Delete block"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
