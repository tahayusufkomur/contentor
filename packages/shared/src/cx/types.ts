import catalogJson from "./primitives.json";
import type { FamilyField } from "../sections/types";

/** The AI component catalog (primitives.json): the one contract shared by the
 *  renderer (frontend-customer components/cx) and, via the synced backend
 *  copy, the validator and the AI prompt. */
export const CX_CATALOG = catalogJson;

/** Block type of an AI-built section. */
export const CX_BLOCK_TYPE = "cx";

/** cx fields use the families.json field format (a subset of its types). */
export type CxFieldSpec = FamilyField;

export interface CxNode {
  t: string;
  children?: CxNode[];
  item?: CxNode[];
  [prop: string]: unknown;
}

export type CxDynamic = "courses" | "plans" | "events";

/** A validated, canonical spec (CSL v1). */
export interface CxSpec {
  csl: 1;
  name: string;
  summary: string;
  fields: Record<string, CxFieldSpec>;
  dynamic: CxDynamic | null;
  tree: CxNode;
}

/** `block.cx` on a stored block: lineage to the registry + the spec snapshot. */
export interface CxRef {
  ref: string | null;
  spec: CxSpec;
}
