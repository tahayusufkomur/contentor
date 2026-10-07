import type { StyleSections } from "./types";
import { sections as journal } from "./journal";
import { sections as kinetic } from "./kinetic";
import { sections as grid } from "./grid";
import { sections as pop } from "./pop";
import { sections as ledger } from "./ledger";
import { sections as darkroom } from "./darkroom";
import { sections as nocturne } from "./nocturne";
import { sections as primer } from "./primer";
import { sections as tavola } from "./tavola";
import { sections as encore } from "./encore";
import { sections as trail } from "./trail";
import { sections as maison } from "./maison";

export const STYLE_SECTION_MODULES: Record<string, Partial<StyleSections>> = {
  journal,
  kinetic,
  grid,
  pop,
  ledger,
  darkroom,
  nocturne,
  primer,
  tavola,
  encore,
  trail,
  maison,
};
