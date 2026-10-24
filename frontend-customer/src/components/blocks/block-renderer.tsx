import { dynamicKeyOf, getBlockDef } from "@/lib/blocks/registry";
import { blockStyleClasses } from "@/lib/blocks/style";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import type { DynamicData } from "@/lib/blocks/fetch-dynamic-data";

/** The slice a block renders: an events block with a limit of "3" or "6" shows
 *  that many (courseShowcase styles apply their own limit). "all" or none: as is. */
export function limitSlice(block: Block, slice: unknown): unknown {
  const n = Number(block.limit);
  if (
    block.type === "section.events" &&
    (n === 3 || n === 6) &&
    Array.isArray(slice)
  ) {
    return slice.slice(0, n);
  }
  return slice;
}

export function BlockRenderer({
  block,
  dynamicData,
  editable,
  styleId,
}: {
  block: Block;
  dynamicData?: DynamicData;
  editable?: EditableContext;
  /** Site style id, for AI-built sections. */
  styleId?: string;
}) {
  if (block.enabled === false) return null;
  const def = getBlockDef(block.type);
  if (!def) return null; // forward-compat: silently skip unknown block types
  const Comp = def.component;
  const key = dynamicKeyOf(block);
  const slice = key ? limitSlice(block, dynamicData?.[key]) : undefined;
  const el = (
    <Comp
      data={block}
      dynamicData={slice}
      editable={editable}
      styleId={styleId}
    />
  );
  // Wrap every block in a div carrying data-block-id and an optional
  // per-block style override — data-block-id makes every rendered block
  // resolvable by the copilot's click-to-select overlay (selection.ts
  // closest("[data-block-id]")).
  const styleClasses = blockStyleClasses(block);
  return (
    <div data-block-id={block.id} className={styleClasses || undefined}>
      {el}
    </div>
  );
}
