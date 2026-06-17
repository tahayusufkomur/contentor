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
  // Apply an optional per-block style override as a wrapper that overrides the
  // block's own <section> (no wrapper when there's no override → public DOM is
  // byte-identical to before).
  const styleClasses = blockStyleClasses(block);
  return styleClasses ? <div className={styleClasses}>{el}</div> : el;
}
