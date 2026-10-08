/** Layout patterns of AI-built sections: one cell, row or step per item of
 *  an items field. Responsive collapse is fixed here; the spec only picks
 *  enums and clamped numbers (passed as --cx-* custom properties). */
import type { CSSProperties } from "react";
import type { CxNode } from "@shared/cx/types";
import { cn } from "@/lib/utils";
import { type CxCtx, type CxRender, clampNum, ordinal, pick } from "./context";

function itemsOf(node: CxNode, ctx: CxCtx): Record<string, unknown>[] {
  const list = ctx.block[String(node.each ?? "")];
  return Array.isArray(list)
    ? list.filter(
        (x): x is Record<string, unknown> =>
          Boolean(x) && typeof x === "object",
      )
    : [];
}

const at = (
  ctx: CxCtx,
  item: Record<string, unknown>,
  index: number,
): CxCtx => ({ ...ctx, item, index });

/** Nothing on the public site; a hint on the coach's canvas. */
function EmptyItems({ ctx }: { ctx: CxCtx }) {
  if (!ctx.editable) return null;
  return (
    <p className="rounded-[var(--radius)] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      Add items in the editor panel.
    </p>
  );
}

const RATIO: Record<string, [string, string]> = {
  "1/2": ["lg:col-span-6", "lg:col-span-6"],
  "5/7": ["lg:col-span-5", "lg:col-span-7"],
  "4/8": ["lg:col-span-4", "lg:col-span-8"],
  "7/5": ["lg:col-span-7", "lg:col-span-5"],
  "8/4": ["lg:col-span-8", "lg:col-span-4"],
};

export const Split: CxRender = (node, ctx) => {
  const [a, b] = pick(node.ratio, RATIO, "1/2");
  const [first, second] = node.children ?? [];
  return (
    <div
      className={cn(
        "grid gap-10 lg:grid-cols-12 lg:gap-14",
        node.valign === "center" && "lg:items-center",
      )}
    >
      <div
        className={cn(
          "min-w-0",
          a,
          node.reverse === true && "lg:order-2",
          node.sticky === true && "lg:sticky lg:top-24 lg:self-start",
        )}
      >
        {ctx.render(first ? [first] : [], ctx)}
      </div>
      <div className={cn("min-w-0", b, node.reverse === true && "lg:order-1")}>
        {ctx.render(second ? [second] : [], ctx)}
      </div>
    </div>
  );
};

const GAP_Y = { sm: "gap-y-6", md: "gap-y-10", lg: "gap-y-16" };

export const Grid: CxRender = (node, ctx) => {
  const items = itemsOf(node, ctx);
  if (!items.length) return <EmptyItems ctx={ctx} />;
  const cols = Math.round(clampNum(node.cols, 1, 6, 3));
  const card =
    node.card === "soft" || node.card === "strong" ? node.card : null;
  const numbered =
    typeof node.numbering === "string" && node.numbering !== "none";
  return (
    <ol
      className={cn(
        "grid gap-x-8 lg:grid-cols-[repeat(var(--cx-cols),minmax(0,1fr))]",
        pick(node.gap, GAP_Y, "md"),
        cols > 1 && "sm:grid-cols-2",
      )}
      style={{ "--cx-cols": cols } as CSSProperties}
    >
      {items.map((item, i) => (
        <li
          key={i}
          className={cn(
            "flex min-w-0 flex-col gap-3",
            card && ctx.kit.card,
            card === "strong" && "bg-muted",
          )}
        >
          {numbered && (
            <span
              aria-hidden="true"
              className={cn(
                ctx.kit.num,
                "font-display text-[1.75rem]/none text-accent",
              )}
            >
              {ordinal(i, node.numbering)}
            </span>
          )}
          {ctx.render(node.item, at(ctx, item, i))}
        </li>
      ))}
    </ol>
  );
};

export const Rows: CxRender = (node, ctx) => {
  const items = itemsOf(node, ctx);
  if (!items.length) return <EmptyItems ctx={ctx} />;
  const divider =
    node.divider === "none" || node.divider === "leader"
      ? node.divider
      : "hairline";
  const numbered =
    typeof node.numbering === "string" && node.numbering !== "none";
  const [head, ...rest] = node.item ?? [];
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => {
        const c = at(ctx, item, i);
        return (
          <li
            key={i}
            className={cn(
              "flex flex-col gap-2 py-6 md:flex-row md:items-baseline md:gap-6",
              divider === "hairline" &&
                "border-t border-border first:border-t-0",
            )}
          >
            {numbered && (
              <span
                aria-hidden="true"
                className={cn(ctx.kit.num, "w-10 shrink-0 text-accent")}
              >
                {ordinal(i, node.numbering)}
              </span>
            )}
            <div
              className={cn(
                "min-w-0",
                divider === "leader" ? "shrink-0" : "md:w-1/3 md:shrink-0",
              )}
            >
              {ctx.render(head ? [head] : [], c)}
            </div>
            {divider === "leader" && (
              <span
                aria-hidden="true"
                className="hidden min-w-8 flex-1 border-b border-dotted border-current opacity-40 md:block"
              />
            )}
            <div
              className={cn(
                "flex min-w-0 flex-col gap-2",
                divider === "leader" ? "md:shrink-0 md:text-right" : "flex-1",
              )}
            >
              {ctx.render(rest, c)}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

function Marker({
  node,
  ctx,
  index,
}: {
  node: CxNode;
  ctx: CxCtx;
  index: number;
}) {
  if (node.marker === "dot")
    return <span className="block size-3 rounded-full bg-primary" />;
  if (node.marker === "glyph") {
    const Glyph = ctx.kit.ornaments.glyph;
    return Glyph ? <Glyph /> : <span className="text-accent">✦</span>;
  }
  return (
    <span
      className={cn(
        ctx.kit.num,
        "grid size-9 place-items-center rounded-full bg-primary text-sm text-primary-foreground",
      )}
    >
      {index + 1}
    </span>
  );
}

export const Timeline: CxRender = (node, ctx) => {
  const items = itemsOf(node, ctx);
  if (!items.length) return <EmptyItems ctx={ctx} />;
  if (node.orient === "horizontal") {
    return (
      <ol className="grid gap-10 md:auto-cols-fr md:grid-flow-col md:gap-8">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex min-w-0 flex-col gap-3 md:border-t md:border-border md:pt-6"
          >
            <span aria-hidden="true" className="flex h-9 items-center">
              <Marker node={node} ctx={ctx} index={i} />
            </span>
            {ctx.render(node.item, at(ctx, item, i))}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <li
          key={i}
          className="group relative grid grid-cols-[2.25rem_1fr] gap-x-6 pb-12 last:pb-0"
        >
          <span aria-hidden="true" className="relative flex justify-center">
            <span className="absolute bottom-0 top-9 w-px bg-border group-last:hidden" />
            <span className="relative flex h-9 items-center">
              <Marker node={node} ctx={ctx} index={i} />
            </span>
          </span>
          <div className="flex min-w-0 flex-col gap-3 pt-1.5">
            {ctx.render(node.item, at(ctx, item, i))}
          </div>
        </li>
      ))}
    </ol>
  );
};

export const Steps: CxRender = (node, ctx) => {
  const items = itemsOf(node, ctx);
  if (!items.length) return <EmptyItems ctx={ctx} />;
  const cols = Math.round(clampNum(node.cols, 2, 5, 3));
  return (
    <ol
      className="grid gap-10 md:grid-cols-[repeat(var(--cx-cols),minmax(0,1fr))] md:gap-8"
      style={{ "--cx-cols": cols } as CSSProperties}
    >
      {items.map((item, i) => (
        <li key={i} className="flex min-w-0 flex-col gap-3">
          <div aria-hidden="true" className="flex items-center gap-4">
            <span
              className={cn(
                ctx.kit.num,
                "font-display text-[2.25rem]/none text-accent",
              )}
            >
              {ordinal(i, node.numbering ?? "pad2")}
            </span>
            {node.connector !== "none" && i < items.length - 1 && (
              <span className="hidden h-px flex-1 bg-border md:block" />
            )}
          </div>
          {ctx.render(node.item, at(ctx, item, i))}
        </li>
      ))}
    </ol>
  );
};

export const Band: CxRender = (node, ctx) => (
  <div
    className={cn(
      "flex flex-col gap-6 rounded-[var(--radius)] p-8 md:p-12",
      node.tone === "surface"
        ? "bg-muted text-foreground"
        : "bg-[var(--inverse)] text-[color:var(--inverse-foreground)]",
    )}
  >
    {ctx.render(node.children, ctx)}
  </div>
);
