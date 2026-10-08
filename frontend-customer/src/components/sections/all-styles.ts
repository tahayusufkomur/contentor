import type { StyleKit } from "./kit-contract";
import type { StyleSections } from "./types";
import * as atelier from "./atelier";
import * as darkroom from "./darkroom";
import * as dojo from "./dojo";
import * as encore from "./encore";
import * as grid from "./grid";
import * as journal from "./journal";
import * as kinetic from "./kinetic";
import * as ledger from "./ledger";
import * as maison from "./maison";
import * as manuscript from "./manuscript";
import * as nocturne from "./nocturne";
import * as pop from "./pop";
import * as primer from "./primer";
import * as sanctum from "./sanctum";
import * as sprout from "./sprout";
import * as studiofloor from "./studiofloor";
import * as tavola from "./tavola";
import * as terminal from "./terminal";
import * as trail from "./trail";
import * as workshop from "./workshop";

/** Every style module, in build order. */
const MODULES = {
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
  studiofloor,
  atelier,
  dojo,
  workshop,
  terminal,
  sprout,
  manuscript,
  sanctum,
};

export const STYLE_SECTION_MODULES: Record<
  string,
  Partial<StyleSections>
> = Object.fromEntries(
  Object.entries(MODULES).map(([id, mod]) => [id, mod.sections]),
);

/** style id → its StyleKit (what AI-built sections render with). */
export const STYLE_KITS: Record<string, StyleKit> = Object.fromEntries(
  Object.entries(MODULES).map(([id, mod]) => [id, mod.kit]),
);
