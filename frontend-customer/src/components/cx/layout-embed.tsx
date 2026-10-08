/** Layout: one of the style's hand-built section layouts (the 300 variants),
 *  filled from the AI section's own fields via `map`. Inline edits on the
 *  embedded layout are routed back to the mapped field. */
import { STYLE_SECTIONS, resolveSection } from "@/components/sections/registry";
import type { EditableContext } from "@/lib/blocks/types";
import type { Block } from "@/types/tenant";
import type { CxRender } from "./context";

/** Edits on the embedded layout go to the cx field its slot is mapped to.
 *  Slots the spec doesn't map are ignored: they would otherwise overwrite a
 *  cx field that merely shares the slot's name. */
export function remap(
  editable: EditableContext,
  map: Record<string, string>,
): EditableContext {
  const target = (name: string) =>
    Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null;
  const rich = editable.onEditRichText;
  return {
    onTextChange: (name, value) => {
      const to = target(name);
      if (to) editable.onTextChange(to, value);
    },
    onEditRichText:
      rich &&
      ((name, value) => {
        const to = target(name);
        if (to) rich(to, value);
      }),
  };
}

export const Layout: CxRender = (node, ctx) => {
  const family = String(node.family ?? "");
  const map = (
    node.map && typeof node.map === "object" ? node.map : {}
  ) as Record<string, string>;
  const name = node.variant === "auto" ? "" : String(node.variant ?? "");
  const block: Block = {
    id: `${ctx.block.id}-${family}`,
    type: `section.${family}`,
    variant: `${ctx.kit.id}.${name}`,
  };
  for (const [to, from] of Object.entries(map)) block[to] = ctx.block[from];
  const Comp = resolveSection(STYLE_SECTIONS, family, block.variant);
  if (!Comp) return null;
  return (
    <Comp
      block={block}
      data={ctx.data}
      editable={ctx.editable && remap(ctx.editable, map)}
    />
  );
};
