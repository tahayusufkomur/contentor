import { Fragment, type ReactNode } from "react";
import type { CxNode, CxSpec } from "@shared/cx/types";
import type { StyleKit } from "@/components/sections/kit-contract";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import type { CxCtx } from "./context";
import { CX_PRIMITIVES } from "./primitives";

/** Child nodes → elements. Unknown primitives (a spec newer than this
 *  build) render nothing. */
export function renderNodes(
  nodes: CxNode[] | undefined,
  ctx: CxCtx,
): ReactNode {
  return (nodes ?? []).map((node, i) => {
    const render = Object.prototype.hasOwnProperty.call(CX_PRIMITIVES, node.t)
      ? CX_PRIMITIVES[node.t]
      : null;
    return render ? <Fragment key={i}>{render(node, ctx)}</Fragment> : null;
  });
}

/** An AI-built section: walks the validated spec with the site style's kit.
 *  Plain functions only, so it server-renders for visitors and
 *  client-renders on the coach's canvas with the same markup. */
export function SpecRenderer({
  spec,
  block,
  data,
  editable,
  kit,
}: {
  spec: CxSpec;
  block: Block;
  data?: unknown;
  editable?: EditableContext;
  kit: StyleKit;
}) {
  const ctx: CxCtx = { kit, block, spec, data, editable, render: renderNodes };
  return <>{renderNodes([spec.tree], ctx)}</>;
}
