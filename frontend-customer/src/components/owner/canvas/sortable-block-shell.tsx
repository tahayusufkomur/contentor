"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import { useEditorStore } from "./editor-store";
import { useRichEditor } from "../rich-editor";
import { BlockToolbar } from "./block-toolbar";
import type { Block, PageKey } from "@/types/tenant";
import type { DynamicData } from "@/lib/blocks/fetch-dynamic-data";

interface SortableBlockShellProps {
  block: Block;
  pageKey: PageKey;
  dynamicData?: DynamicData;
}

/** One block on the live canvas: draggable (via the toolbar handle), selectable
 *  (click anywhere selects + opens its sidebar form), and visually marked when
 *  hidden. The block itself renders through the SAME `BlockRenderer` as the
 *  public site, so edit and published markup never diverge. */
export function SortableBlockShell({
  block,
  pageKey,
  dynamicData,
}: SortableBlockShellProps) {
  const store = useEditorStore();
  const {
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: block.id,
  });
  const selected = store.selectedBlockId === block.id;
  const disabled = block.enabled === false;
  const richEditor = useRichEditor();
  const editable = {
    onTextChange: (field: string, value: string) =>
      store.updateBlock(pageKey, block.id, { [field]: value }),
    onEditRichText: richEditor
      ? (field: string, value: string) =>
          richEditor.openRichEditor({
            value,
            title: "Edit text",
            onSave: (html) =>
              store.updateBlock(pageKey, block.id, { [field]: html }),
          })
      : undefined,
  };

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/block relative",
        isDragging && "z-30 opacity-60",
        selected && "outline outline-2 -outline-offset-2 outline-primary",
        !selected &&
          "hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-primary/40",
      )}
      onClickCapture={(e) => {
        // Select on click. Stop the click reaching in-block links/buttons so the
        // coach never navigates away mid-edit — but let clicks through to inline
        // editable text (so it can focus) and to the block toolbar (so its
        // buttons fire; this is a capture handler, so swallowing here would
        // otherwise kill the toolbar's own onClick).
        const target = e.target as HTMLElement;
        if (
          !target.closest(
            '[data-inline-editable="true"], [data-rich-body="true"], [data-block-toolbar="true"]',
          )
        ) {
          e.stopPropagation();
          e.preventDefault();
        }
        store.selectBlock(block.id);
      }}
      onMouseEnter={() => store.hoverBlock(block.id)}
      onMouseLeave={() => store.hoverBlock(null)}
    >
      <BlockToolbar
        block={block}
        pageKey={pageKey}
        selected={selected}
        dragHandleRef={setActivatorNodeRef}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
      {disabled && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-background/60">
          <span className="mt-3 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
            Hidden
          </span>
        </div>
      )}
      <div className={cn(disabled && "opacity-50")}>
        {/* Force-render even when hidden so the coach can see/re-enable it. */}
        <BlockRenderer
          block={{ ...block, enabled: true }}
          dynamicData={dynamicData}
          editable={editable}
        />
      </div>
    </div>
  );
}
