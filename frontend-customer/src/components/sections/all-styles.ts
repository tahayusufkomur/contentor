import type { StyleSections } from "./types";
import { sections as journal } from "./journal";
import { sections as kinetic } from "./kinetic";
import { sections as grid } from "./grid";
import { sections as pop } from "./pop";

export const STYLE_SECTION_MODULES: Record<string, Partial<StyleSections>> = {
  journal,
  kinetic,
  grid,
  pop,
};
