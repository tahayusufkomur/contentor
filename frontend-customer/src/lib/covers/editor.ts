// The studio's edit reducer: every change she can make to a cover recipe, as a pure function, so the
// editor keeps an EditHistory of recipes (lib/logo/history.ts) and Undo and Redo cover every edit.
//
// The backend validates each save (design_recipe.py) and answers 400 to what it refuses, so the
// reducer never writes that: no null in a style, no extra id that is malformed, taken or a part's, no
// more than MAX_EXTRAS extras. An edit that changes nothing returns the recipe it was given, so a
// caller can skip the history push.
//
// ponytail: fixed parts keep a fixed stacking order; extras stack above them in array order — free z-order for parts if she asks.

import { push, type EditHistory } from "@/lib/logo/history";
import { MAX_EXTRAS, PARTS } from "@/types/design";
import type {
  CoverRecipe,
  CoverSize,
  Extra,
  Frame,
  LayoutId,
  Paint,
  PartId,
  PartStyle,
  ShapeKind,
} from "@/types/design";
import { fromSet } from "./recipe";

/** What `updateExtra` can change: any field of the extra but its id and type. Fields the extra's kind
 *  does not have are ignored. `style` merges like a `style` action (undefined deletes a key). */
export type ExtraPatch = Partial<{
  text: string;
  style: Partial<PartStyle>;
  fill: Paint;
  shape: ShapeKind;
  opacity: number;
  frame: Frame;
}>;

export type EditorAction =
  | { type: "layout"; layout: LayoutId }
  /** `null` takes the photo away. The new photo's subject sits elsewhere: focus and zoom reset. */
  | { type: "photo"; id: string | null }
  | {
      type: "photoAdjust";
      patch: Partial<Omit<CoverRecipe["photo"], "id">>;
    }
  | { type: "words"; patch: Partial<CoverRecipe["words"]> }
  | { type: "badge"; patch: Partial<CoverRecipe["badge"]> }
  | { type: "panel"; paint: Paint }
  /** A key set to undefined deletes it: the layout's own comes back. */
  | { type: "style"; part: PartId; patch: Partial<PartStyle> }
  | { type: "logo"; on: boolean }
  /** "Your set": the layout, colours, styles, badge and logo of a kept cover. */
  | { type: "applySet"; set: CoverRecipe }
  /** One layer's frame at one size; the other sizes keep theirs. */
  | { type: "frame"; size: CoverSize; id: string; frame: Frame }
  | { type: "addExtra"; extra: Extra }
  | { type: "updateExtra"; id: string; patch: ExtraPatch }
  /** A fixed part is hidden, an extra deleted. */
  | { type: "remove"; id: string }
  /** Extras only. The copy is the last extra: on top, and offset so it shows. */
  | { type: "duplicate"; id: string }
  /** Extras only: swap with the neighbour above (forward) or below (back). */
  | { type: "order"; id: string; dir: "forward" | "back" };

type Styles = CoverRecipe["styles"];
type Overrides = CoverRecipe["overrides"];

const EXTRA_ID = /^[a-z0-9-]{1,24}$/;
/** How far a copy sits from its source, in fractions of the canvas. */
const COPY_OFFSET = 0.03;

const isPart = (id: string): id is PartId =>
  (PARTS as readonly string[]).includes(id);
const has = (object: object, key: string) =>
  Object.prototype.hasOwnProperty.call(object, key);
const isExtraId = (id: string) => !isPart(id);

/** `base` with the fields of `patch` that are not undefined (the action types say which fields). */
const assign = <T extends object>(base: T, patch: object): T => ({
  ...base,
  ...Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ),
});

/** A style with `patch` applied. A key set to undefined (or null, from a caller without types) is
 *  deleted, never written: the backend refuses null, and a deleted key is the layout's own. */
function mergeStyle(
  style: PartStyle | undefined,
  patch: Partial<PartStyle>,
): PartStyle {
  const next: Record<string, unknown> = { ...style };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) delete next[key];
    else next[key] = value;
  }
  return next as PartStyle;
}

const withStyle = (
  styles: Styles,
  part: PartId,
  patch: Partial<PartStyle>,
): Styles => ({ ...styles, [part]: mergeStyle(styles[part], patch) });

/** Setting what a part shows (typing its words, picking its photo) brings it back if she had removed
 *  it; otherwise she would type into a word that stays hidden. */
const shown = (styles: Styles, ...parts: PartId[]): Styles =>
  parts.reduce(
    (all, part) =>
      all[part]?.hidden ? withStyle(all, part, { hidden: undefined }) : all,
    styles,
  );

/** The per-size frames whose layer `keep` accepts; a size left with none goes. */
function keepOverrides(
  overrides: Overrides,
  keep: (id: string) => boolean,
): Overrides {
  const next: Overrides = {};
  for (const size of Object.keys(overrides) as CoverSize[]) {
    const frames = Object.entries(overrides[size] ?? {}).filter(([id]) =>
      keep(id),
    );
    if (frames.length > 0) next[size] = Object.fromEntries(frames);
  }
  return next;
}

/** An extra id no layer of `recipe` has: x1, x2, ... A copy's comes from its source's (x1 gives x2,
 *  or the next free number). The same recipe always gives the same id, which keeps the reducer pure.
 *  It ends in a number and no part's id does, so it is never a part's. */
export function newExtraId(recipe: CoverRecipe, from = "x"): string {
  const taken = new Set(recipe.extras.map((extra) => extra.id));
  // the backend takes 24 characters at most: leave room for the number
  const stem = from.replace(/\d+$/, "").slice(0, 20);
  for (let n = 1; ; n++) {
    if (!taken.has(`${stem}${n}`)) return `${stem}${n}`;
  }
}

function patchExtra(extra: Extra, patch: ExtraPatch): Extra {
  const next: Record<string, unknown> = { ...extra };
  for (const [key, value] of Object.entries(patch)) {
    // only the fields this kind of extra has; an id or type never changes
    if (value === undefined || !has(extra, key)) continue;
    if (key === "id" || key === "type") continue;
    next[key] =
      key === "style"
        ? mergeStyle((extra as { style?: PartStyle }).style, value as PartStyle)
        : value;
  }
  return next as Extra;
}

const nudge = (frame: Frame): Frame => ({
  ...frame,
  x: frame.x + COPY_OFFSET,
  y: frame.y + COPY_OFFSET,
});

export function applyEdit(
  recipe: CoverRecipe,
  action: EditorAction,
): CoverRecipe {
  switch (action.type) {
    case "layout":
      // a fixed part's frame is a position in the old layout; an extra's is her own
      return {
        ...recipe,
        layout: action.layout,
        overrides: keepOverrides(recipe.overrides, isExtraId),
      };

    case "applySet":
      return {
        ...recipe,
        ...fromSet(action.set),
        overrides: keepOverrides(recipe.overrides, isExtraId),
      };

    case "photo":
      return {
        ...recipe,
        photo: { ...recipe.photo, id: action.id, focus: [0.5, 0.5], zoom: 1 },
        styles: shown(recipe.styles, "photo"),
      };

    case "photoAdjust":
      return { ...recipe, photo: assign(recipe.photo, action.patch) };

    case "words": {
      const words = assign(recipe.words, action.patch);
      // a blank title is no title: it follows the item's own
      if (words.title !== null && words.title.trim() === "") words.title = null;
      const touched = Object.entries(action.patch)
        .filter(([, value]) => value !== undefined)
        .map(([part]) => part as PartId);
      return { ...recipe, words, styles: shown(recipe.styles, ...touched) };
    }

    case "badge":
      return {
        ...recipe,
        badge: assign(recipe.badge, action.patch),
        styles: shown(recipe.styles, "badge"),
      };

    case "panel":
      return {
        ...recipe,
        panel: action.paint,
        styles: shown(recipe.styles, "panel"),
      };

    case "logo":
      return {
        ...recipe,
        logo: action.on,
        styles: action.on ? shown(recipe.styles, "logo") : recipe.styles,
      };

    case "style":
      return {
        ...recipe,
        styles: withStyle(recipe.styles, action.part, action.patch),
      };

    case "frame":
      return {
        ...recipe,
        overrides: {
          ...recipe.overrides,
          [action.size]: {
            ...recipe.overrides[action.size],
            [action.id]: action.frame,
          },
        },
      };

    case "addExtra": {
      if (recipe.extras.length >= MAX_EXTRAS) return recipe;
      const { id } = action.extra;
      const usable =
        EXTRA_ID.test(id) &&
        !isPart(id) &&
        !recipe.extras.some((extra) => extra.id === id);
      const extra = usable
        ? action.extra
        : { ...action.extra, id: newExtraId(recipe) };
      return { ...recipe, extras: [...recipe.extras, extra] };
    }

    case "updateExtra":
      if (!recipe.extras.some((extra) => extra.id === action.id)) return recipe;
      return {
        ...recipe,
        extras: recipe.extras.map((extra) =>
          extra.id === action.id ? patchExtra(extra, action.patch) : extra,
        ),
      };

    case "remove":
      if (isPart(action.id)) {
        return {
          ...recipe,
          styles: withStyle(recipe.styles, action.id, { hidden: true }),
        };
      }
      if (!recipe.extras.some((extra) => extra.id === action.id)) return recipe;
      return {
        ...recipe,
        extras: recipe.extras.filter((extra) => extra.id !== action.id),
        overrides: keepOverrides(recipe.overrides, (id) => id !== action.id),
      };

    case "duplicate": {
      const source = recipe.extras.find((extra) => extra.id === action.id);
      if (!source || recipe.extras.length >= MAX_EXTRAS) return recipe;
      const id = newExtraId(recipe, source.id);
      const overrides: Overrides = {};
      for (const size of Object.keys(recipe.overrides) as CoverSize[]) {
        const frames = recipe.overrides[size] ?? {};
        overrides[size] = has(frames, source.id)
          ? { ...frames, [id]: nudge(frames[source.id]) }
          : frames;
      }
      const copy = { ...source, id, frame: nudge(source.frame) };
      return { ...recipe, extras: [...recipe.extras, copy], overrides };
    }

    case "order": {
      const from = recipe.extras.findIndex((extra) => extra.id === action.id);
      const to = from + (action.dir === "forward" ? 1 : -1);
      if (from < 0 || to < 0 || to >= recipe.extras.length) return recipe;
      const extras = [...recipe.extras];
      extras.splice(to, 0, ...extras.splice(from, 1));
      return { ...recipe, extras };
    }

    default:
      return recipe;
  }
}

/** The field names of a patch, a style's keys as `style.<key>`. */
const fields = (patch: object): string =>
  Object.entries(patch)
    .flatMap(([key, value]) =>
      key === "style" && value
        ? Object.keys(value).map((styleKey) => `style.${styleKey}`)
        : [key],
    )
    .sort()
    .join(",");

/** The `push` key of `lib/logo/history.ts`: edits with the same key within 400 ms are one undo step.
 *  Typing in a word, a slider and a drag coalesce, by part or field (a drag by size and layer);
 *  a layout, a photo, an add, a remove and the rest are a step each (null). */
export function coalesceKey(action: EditorAction): string | null {
  switch (action.type) {
    case "words":
    case "badge":
    case "photoAdjust":
      return `${action.type}:${fields(action.patch)}`;
    case "style":
      return `style:${action.part}:${fields(action.patch)}`;
    case "updateExtra":
      return `extra:${action.id}:${fields(action.patch)}`;
    case "frame":
      return `frame:${action.size}:${action.id}`;
    case "panel":
      return "panel";
    default:
      return null;
  }
}

/** The history after `action`: the same one when the action changed nothing (she taps the layout she is
 *  on), else the edit as a new step, joined to the last when its key matches (see `coalesceKey`). `now` is
 *  for tests. */
export function editHistory(
  history: EditHistory<CoverRecipe>,
  action: EditorAction,
  now?: number,
): EditHistory<CoverRecipe> {
  const next = applyEdit(history.present, action);
  // Equal by value: `layout` builds a new recipe even for the layout it is on.
  if (
    next === history.present ||
    JSON.stringify(next) === JSON.stringify(history.present)
  ) {
    return history;
  }
  return push(history, next, coalesceKey(action), now);
}
