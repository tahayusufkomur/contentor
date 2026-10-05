import type { SectionComponent, StyleSections } from "./types";
import { STYLE_SECTION_MODULES } from "./all-styles";

/** style id → that style's layouts. */
export const STYLE_SECTIONS: Record<
  string,
  Partial<StyleSections>
> = STYLE_SECTION_MODULES;

/** Layout for `family` given a stored `variant` ("<style>.<name>"). Unknown
 *  name → the style's first layout for that family; unknown style → the first
 *  style that has the family. Never throws. */
export function resolveSection(
  map: Record<string, Partial<StyleSections>>,
  family: string,
  variant: unknown,
): SectionComponent | null {
  const [styleId, name] = String(variant ?? "").split(".");
  const byFamily = (s?: Partial<StyleSections>) =>
    s?.[family as keyof StyleSections];
  const fam = byFamily(map[styleId]);
  if (fam) return fam[name ?? ""] ?? Object.values(fam)[0] ?? null;
  for (const s of Object.values(map)) {
    const f = byFamily(s);
    if (f) return Object.values(f)[0] ?? null;
  }
  return null;
}
