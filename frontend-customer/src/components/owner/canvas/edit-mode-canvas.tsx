"use client";

import { Fragment } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { useOptionalEditorStore } from "./editor-store";
import { useEditMode } from "../edit-mode";
import { SortableBlockShell } from "./sortable-block-shell";
import { DropZone } from "./drop-zone";
import type { Block, PageKey } from "@/types/tenant";
import type { DynamicData } from "@/lib/blocks/fetch-dynamic-data";

interface EditModeCanvasProps {
  pageKey: PageKey;
  /** SSR/fallback blocks. Used only if the editor store isn't mounted. */
  blocks: Block[];
  dynamicData?: DynamicData;
}

/** The coach's live, editable view of a page. Renders the page's blocks from
 *  the editor store (the single source of truth while editing) wrapped in
 *  drag/select shells, with drop zones between them for palette inserts.
 *  Mounted only for coaches; students get `PageRenderer`.
 *
 *  If the store provider is somehow absent (e.g. the layout couldn't load the
 *  config), it degrades gracefully to a static, non-editable render. */
export function EditModeCanvas({
  pageKey,
  blocks,
  dynamicData,
}: EditModeCanvasProps) {
  const store = useOptionalEditorStore();
  const editMode = useEditMode();
  const liveBlocks = store ? store.blocksFor(pageKey) : blocks;

  // Outside edit mode (or with no store), render the page read-only — the same
  // static output a visitor sees — so the coach previews their site as-is. The
  // editing chrome (drag handles, selection, inline text) only appears when the
  // coach has explicitly turned edit mode on. Matches PageRenderer's full-bleed
  // wrapper so the canvas mirrors the live page.
  if (!store || !editMode) {
    return (
      <div className="-mx-4 -mt-8 md:-mx-6">
        {liveBlocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            dynamicData={dynamicData}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="-mx-4 -mt-8 md:-mx-6">
      {liveBlocks.length === 0 ? (
        <div className="px-4 py-20 text-center text-sm text-muted-foreground">
          <p className="mb-2">This page has no blocks yet.</p>
          <p>Add one from the editor panel, or drag a block here.</p>
          <DropZone pageKey={pageKey} index={0} />
        </div>
      ) : (
        <SortableContext
          items={liveBlocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <DropZone pageKey={pageKey} index={0} />
          {liveBlocks.map((block, i) => (
            <Fragment key={block.id}>
              <SortableBlockShell
                block={block}
                pageKey={pageKey}
                dynamicData={dynamicData}
              />
              <DropZone pageKey={pageKey} index={i + 1} />
            </Fragment>
          ))}
        </SortableContext>
      )}
    </div>
  );
}
