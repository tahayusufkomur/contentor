import { Wand2 } from "lucide-react";
import { CX_BLOCK_TYPE, type CxSpec } from "@shared/cx/types";
import { CxBlock } from "@/components/cx/cx-block";
import type { Block } from "@/types/tenant";
import type { FieldSchema } from "./field-schema";
import type { Say } from "./say";
import { toField } from "./section-defs";
import type { BlockDefinition, DynamicDataKey } from "./types";

/** AI-built sections. Their form fields and dataset come from each block's
 *  own spec, so the static definition carries none. Never offered in the
 *  palette (a cx block needs a spec): added via "Describe a section". */
export const cxBlockDef = (ui: Say): BlockDefinition => ({
  type: CX_BLOCK_TYPE,
  label: ui("block.cx"),
  icon: Wand2,
  group: "custom",
  component: CxBlock,
  defaultData: {},
  fields: [],
});

export function cxSpecOf(block: Block): CxSpec | undefined {
  const spec = (block.cx as { spec?: CxSpec } | undefined)?.spec;
  return spec && typeof spec === "object" && spec.tree ? spec : undefined;
}

/** The form of an AI-built section: its labels are the model's own words, only
 *  the hints around them (`ui`) are the creator's language. */
export function cxFields(block: Block, ui: Say): FieldSchema[] {
  const spec = cxSpecOf(block);
  return spec
    ? Object.entries(spec.fields).map(([key, field]) => toField(key, field, ui))
    : [];
}

export function cxDynamicKey(block: Block): DynamicDataKey | undefined {
  if (block.type !== CX_BLOCK_TYPE) return undefined;
  const source = cxSpecOf(block)?.dynamic;
  return source === "courses" || source === "plans" || source === "events"
    ? source
    : undefined;
}
