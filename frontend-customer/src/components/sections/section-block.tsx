import { STYLE_SECTIONS, resolveSection } from "./registry";
import type { BlockComponentProps } from "@/lib/blocks/types";

/** Renders any `section.<family>` block: the variant `<style>.<name>` picks
 *  the layout; content stays the same across styles. */
export function SectionBlock({
  data,
  dynamicData,
  editable,
}: BlockComponentProps) {
  const family = String(data.type).slice("section.".length);
  const Comp = resolveSection(STYLE_SECTIONS, family, data.variant);
  if (!Comp) return null;
  return <Comp block={data} data={dynamicData} editable={editable} />;
}
