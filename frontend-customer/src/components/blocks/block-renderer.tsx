import { getBlockDef } from "@/lib/blocks/registry";
import type { Block } from "@/types/tenant";
import type { DynamicData } from "@/lib/blocks/fetch-dynamic-data";

export function BlockRenderer({ block, dynamicData }: { block: Block; dynamicData?: DynamicData }) {
  if (block.enabled === false) return null;
  const def = getBlockDef(block.type);
  if (!def) return null; // forward-compat: silently skip unknown block types
  const Comp = def.component;
  const slice = def.dynamicDataKey ? dynamicData?.[def.dynamicDataKey] : undefined;
  return <Comp data={block} dynamicData={slice} />;
}
