"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { BLOCKS_BY_GROUP, getBlockDef, newBlock } from "@/lib/blocks/registry";
import { BlockForm } from "./block-form";
import type { Block, PageKey, TenantConfig } from "@/types/tenant";

interface BlocksTabProps {
  config: TenantConfig;
  pageKey: PageKey;
  onChange: (patch: Partial<TenantConfig>) => void;
}

export function BlocksTab({ config, pageKey, onChange }: BlocksTabProps) {
  const blocks = config.pages?.[pageKey]?.blocks ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const commit = (next: Block[]) =>
    onChange({ pages: { ...(config.pages ?? {}), [pageKey]: { blocks: next } } });

  const updateBlock = (id: string, patch: Partial<Block>) =>
    commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBlock = (id: string) => {
    commit(blocks.filter((b) => b.id !== id));
    setConfirmingId(null);
  };
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[j]] = [next[j], next[index]];
    commit(next);
  };
  const add = (type: string) => {
    const block = newBlock(type);
    commit([...blocks, block]);
    setAdding(false);
    setExpandedId(block.id);
  };

  return (
    <div className="space-y-3">
      {blocks.length === 0 && (
        <p className="text-xs text-muted-foreground">No blocks yet. Add one below.</p>
      )}

      {blocks.map((block, i) => {
        const def = getBlockDef(block.type);
        const Icon = def?.icon;
        const open = expandedId === block.id;
        const enabled = block.enabled !== false;
        return (
          <div key={block.id} className="overflow-hidden rounded-lg border">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex flex-col text-muted-foreground">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="hover:text-foreground disabled:opacity-30"
                  title="Move up"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === blocks.length - 1}
                  className="hover:text-foreground disabled:opacity-30"
                  title="Move down"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : block.id)}
                className="flex flex-1 items-center gap-2 text-left"
              >
                {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                <span className="text-sm font-medium">{def?.label ?? block.type}</span>
                {!enabled && <span className="text-xs text-muted-foreground">(hidden)</span>}
              </button>
              <Switch checked={enabled} onCheckedChange={(v) => updateBlock(block.id, { enabled: v })} />
              <button
                type="button"
                onClick={() => setConfirmingId(confirmingId === block.id ? null : block.id)}
                className="text-muted-foreground transition-colors hover:text-destructive"
                title="Delete block"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : block.id)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-150", open && "rotate-180")} />
              </button>
            </div>

            {confirmingId === block.id && (
              <div className="flex items-center justify-between border-t bg-destructive/5 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Delete this block?</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => removeBlock(block.id)}
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
                <BlockForm block={block} onChange={(patch) => updateBlock(block.id, patch)} />
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
                    <button
                      key={def.type}
                      type="button"
                      onClick={() => add(def.type)}
                      className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {def.label}
                    </button>
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
