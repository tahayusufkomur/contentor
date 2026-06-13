import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Block } from "@/types/tenant";
import type { FieldSchema } from "./field-schema";

export type BlockGroup = "content" | "dynamic";

/** Datasets dynamic blocks pull at render time. */
export type DynamicDataKey = "courses" | "plans" | "events" | "storeProducts";

export interface BlockComponentProps {
  data: Block;
  /** The slice of dynamic data for this block (dynamic blocks only). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dynamicData?: any;
}

export interface BlockDefinition {
  type: string;
  label: string;
  icon: LucideIcon;
  group: BlockGroup;
  /** Seed data applied when a coach adds this block. */
  defaultData: Partial<Block>;
  /** Drives the schema-driven editor form. */
  fields: FieldSchema[];
  component: ComponentType<BlockComponentProps>;
  /** Set on dynamic blocks; selects which dataset to fetch + pass in. */
  dynamicDataKey?: DynamicDataKey;
}
