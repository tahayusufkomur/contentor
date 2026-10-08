import { Wand2 } from "lucide-react";
import { CX_BLOCK_TYPE, type CxSpec } from "@shared/cx/types";
import { CxBlock } from "@/components/cx/cx-block";
import type { Block } from "@/types/tenant";
import type { FieldSchema } from "./field-schema";
import { toField } from "./section-defs";
import type { BlockDefinition, DynamicDataKey } from "./types";

/** AI-built sections. Their form fields and dataset come from each block's
 *  own spec, so the static definition carries none. Never offered in the
 *  palette (a cx block needs a spec): added via "Describe a section". */
export const CX_BLOCK_DEF: BlockDefinition = {
  type: CX_BLOCK_TYPE,
  label: "Custom section",
  icon: Wand2,
  group: "custom",
  component: CxBlock,
  defaultData: {},
  fields: [],
};

export function cxSpecOf(block: Block): CxSpec | undefined {
  const spec = (block.cx as { spec?: CxSpec } | undefined)?.spec;
  return spec && typeof spec === "object" && spec.tree ? spec : undefined;
}

export function cxFields(block: Block): FieldSchema[] {
  const spec = cxSpecOf(block);
  return spec
    ? Object.entries(spec.fields).map(([key, field]) => toField(key, field))
    : [];
}

export function cxDynamicKey(block: Block): DynamicDataKey | undefined {
  if (block.type !== CX_BLOCK_TYPE) return undefined;
  const source = cxSpecOf(block)?.dynamic;
  return source === "courses" || source === "plans" || source === "events"
    ? source
    : undefined;
}
