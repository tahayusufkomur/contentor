"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutTemplate,
} from "lucide-react";
import { BLOCKS_BY_GROUP, getBlockDef, newBlock } from "@/lib/blocks/registry";
import { useEditorStore } from "./canvas/editor-store";
import { PaletteDragSource } from "./canvas/palette-drag-source";
import { TemplateGallery } from "./template-gallery";
import { BlockForm } from "./block-form";
import type { Block, PageKey, PageTemplate } from "@/types/tenant";

interface BlocksTabProps {
  pageKey: PageKey;
  savedTemplates: PageTemplate[];
  onSaveTemplate: (name: string, blocks: Block[]) => void;
  onDeleteTemplate: (id: string) => void;
}

export function BlocksTab({
  pageKey,
  savedTemplates,
  onSaveTemplate,
  onDeleteTemplate,
}: BlocksTabProps) {
  const store = useEditorStore();
  const blocks = store.blocksFor(pageKey);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const remove = (id: string) => {
    store.removeBlock(pageKey, id);
    setConfirmingId(null);
  };
  const add = (type: string) => {
    store.insertBlock(pageKey, newBlock(type, store.niche));
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setGalleryOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
      >
        <LayoutTemplate className="h-3.5 w-3.5" /> Templates
      </button>

      {galleryOpen && (
        <TemplateGallery
          pageKey={pageKey}
          savedTemplates={savedTemplates}
          onSaveTemplate={onSaveTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onClose={() => setGalleryOpen(false)}
        />
      )}

      {blocks.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No blocks yet. Add one below.
        </p>
      )}

      {blocks.map((block, i) => {
        const def = getBlockDef(block.type);
        const Icon = def?.icon;
        const open = store.selectedBlockId === block.id;
        const enabled = block.enabled !== false;
        return (
          <div
            key={block.id}
            className={cn(
              "overflow-hidden rounded-lg border",
              open && "border-primary ring-1 ring-primary",
            )}
            onMouseEnter={() => store.hoverBlock(block.id)}
            onMouseLeave={() => store.hoverBlock(null)}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex flex-col text-muted-foreground">
                <button
                  type="button"
                  onClick={() => store.reorderBlocks(pageKey, i, i - 1)}
                  disabled={i === 0}
                  className="hover:text-foreground disabled:opacity-30"
                  title="Move up"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => store.reorderBlocks(pageKey, i, i + 1)}
                  disabled={i === blocks.length - 1}
                  className="hover:text-foreground disabled:opacity-30"
                  title="Move down"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => store.selectBlock(open ? null : block.id)}
                className="flex flex-1 items-center gap-2 text-left"
              >
                {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm font-medium">
                  {def?.label ?? block.type}
                </span>
                {!enabled && (
                  <span className="text-xs text-muted-foreground">
                    (hidden)
                  </span>
                )}
              </button>
              <Switch
                checked={enabled}
                onCheckedChange={(v) =>
                  store.setBlockEnabled(pageKey, block.id, v)
                }
              />
              <button
                type="button"
                onClick={() =>
                  setConfirmingId(confirmingId === block.id ? null : block.id)
                }
                className="text-muted-foreground transition-colors hover:text-destructive"
                title="Delete block"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => store.selectBlock(open ? null : block.id)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-150",
                    open && "rotate-180",
                  )}
                />
              </button>
            </div>

            {confirmingId === block.id && (
              <div className="flex items-center justify-between border-t bg-destructive/5 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  Delete this block?
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => remove(block.id)}
                    className="font-medium text-destructive hover:underline"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {open && (
              <div className="border-t bg-accent/20 px-3 py-3">
                <BlockForm
                  block={block}
                  onChange={(patch) =>
                    store.updateBlock(pageKey, block.id, patch)
                  }
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Add block */}
      {adding ? (
        <div className="space-y-3 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add a block
            </span>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {(["content", "dynamic"] as const).map((group) => (
            <div key={group} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {group === "content" ? "Content" : "Dynamic"}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {BLOCKS_BY_GROUP[group].map((def) => {
                  const Icon = def.icon;
                  return (
                    <PaletteDragSource
                      key={def.type}
                      type={def.type}
                      onClick={() => add(def.type)}
                      className="flex cursor-grab items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors hover:border-primary hover:bg-primary/5 active:cursor-grabbing"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {def.label}
                    </PaletteDragSource>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add block
        </button>
      )}
    </div>
  );
}
