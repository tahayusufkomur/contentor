import type { ReactNode } from "react";
import type { CxNode, CxSpec } from "@shared/cx/types";
import type { StyleKit } from "@/components/sections/kit-contract";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";

/** Everything a primitive renderer needs. `item`/`index` are set inside an
 *  item template (Grid, Rows, Timeline, Steps). */
export interface CxCtx {
  kit: StyleKit;
  block: Block;
  spec: CxSpec;
  data?: unknown;
  editable?: EditableContext;
  item?: Record<string, unknown>;
  index?: number;
  /** Renders child nodes (passed in, so renderer modules import no cycle). */
  render: (nodes: CxNode[] | undefined, ctx: CxCtx) => ReactNode;
}

export type CxRender = (node: CxNode, ctx: CxCtx) => ReactNode;

export const isItemBind = (bind: unknown) =>
  typeof bind === "string" && bind.startsWith("$.");

/** "$.title" → the current item's value; "heading" → the block's. */
export function valueOf(ctx: CxCtx, bind: unknown): unknown {
  if (typeof bind !== "string") return undefined;
  return isItemBind(bind) ? ctx.item?.[bind.slice(2)] : ctx.block[bind];
}

export const text = (value: unknown) =>
  typeof value === "string" ? value : "";

/** table[value] for a known key (own keys only), else table[fallback]. */
export function pick<T>(
  value: unknown,
  table: Record<string, T>,
  fallback: string,
): T {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(table, value)
    ? table[value]
    : table[fallback];
}

export function clampNum(
  value: unknown,
  lo: number,
  hi: number,
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** 0 → "01" (pad2), "1" (plain) or "I" (roman). */
export function ordinal(index: number, format: unknown): string {
  const n = index + 1;
  if (format === "plain") return String(n);
  if (format === "roman") {
    let rest = n;
    let out = "";
    for (const [value, numeral] of ROMAN) {
      while (rest >= value) {
        out += numeral;
        rest -= value;
      }
    }
    return out;
  }
  return String(n).padStart(2, "0");
}
