import { getBlockDef } from "@/lib/blocks/registry";
import { blockStyleClasses } from "@/lib/blocks/style";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import type { DynamicData } from "@/lib/blocks/fetch-dynamic-data";

export function BlockRenderer({
  block,
  dynamicData,
  editable,
}: {
  block: Block;
  dynamicData?: DynamicData;
  editable?: EditableContext;
}) {
  if (block.enabled === false) return null;
  const def = getBlockDef(block.type);
  if (!def) return null; // forward-compat: silently skip unknown block types
  const Comp = def.component;
  const slice = def.dynamicDataKey
    ? dynamicData?.[def.dynamicDataKey]
    : undefined;
  const el = <Comp data={block} dynamicData={slice} editable={editable} />;
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
