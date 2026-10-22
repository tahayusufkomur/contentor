// Pure operations on an email design: every block list (the three regions and
// each column inside a columns block, at any depth) is reachable by id. Each
// operation returns a new design and leaves untouched lists as they were.

import type {
  Block,
  BrandKit,
  Column,
  DropTarget,
  EmailDesign,
  RegionKey,
  TemplateSettings,
} from "./types";

export const REGIONS: RegionKey[] = ["header", "body", "footer"];

/** Settings of a new design, in brand tokens so a look change re-skins it. */
export const BRAND_SETTINGS: TemplateSettings = {
  backgroundColor: "brand:surface",
  bodyBackgroundColor: "brand:background",
  contentWidth: 600,
  bodyBorderRadius: 0,
  defaultFont: "brand:body",
  defaultFontSize: 16,
  defaultColor: "brand:foreground",
};

export const EMPTY_DESIGN: EmailDesign = {
  version: 1,
  settings: BRAND_SETTINGS,
  header: { blocks: [] },
  body: { blocks: [] },
  footer: { blocks: [] },
};

export function mintBlockId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `b${random.slice(0, 10)}`;
}

export function designHasContent(design: EmailDesign | null | undefined) {
  return (design?.body?.blocks?.length ?? 0) > 0;
}

// ── shape repair ──────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObject).map((b) => {
    const block = {
      ...b,
      id: typeof b.id === "string" && b.id ? b.id : mintBlockId(),
      data: isObject(b.data) ? b.data : {},
      style: isObject(b.style) ? b.style : {},
    } as Record<string, unknown>;
    if (block.type === "columns") {
      const data = block.data as Record<string, unknown>;
      const columns = Array.isArray(data.columns) ? data.columns : [];
      block.data = {
        ...data,
        columns: columns.filter(isObject).map((c) => ({
          ...c,
          id: typeof c.id === "string" && c.id ? c.id : mintBlockId(),
          blocks: cleanBlocks(c.blocks),
        })),
      };
    }
    return block as unknown as Block;
  });
}

/** Any design-like value (an old row, an AI reply, an import) as a design the
 *  editor can hold: settings filled in, every list an array, every block with
 *  an id, data and style. */
export function normalizeDesign(raw: unknown): EmailDesign {
  const d = isObject(raw) ? raw : {};
  const region = (key: RegionKey) =>
    cleanBlocks(
      isObject(d[key]) ? (d[key] as Record<string, unknown>).blocks : [],
    );
  return {
    version: typeof d.version === "number" ? d.version : 1,
    settings: {
      ...BRAND_SETTINGS,
      ...(isObject(d.settings)
        ? (d.settings as Partial<TemplateSettings>)
        : {}),
    },
    header: { blocks: region("header") },
    body: { blocks: region("body") },
    footer: { blocks: region("footer") },
  };
}

// ── walking ───────────────────────────────────────────────────────────────

export interface ListLoc {
  region: RegionKey;
  parentId: string | null;
  columnId: string | null;
}

type Visit = (blocks: Block[], loc: ListLoc) => Block[];

function mapList(blocks: Block[], loc: ListLoc, visit: Visit): Block[] {
  let changed = false;
  const inner = blocks.map((b) => {
    if (b.type !== "columns") return b;
    let colsChanged = false;
    const columns = b.data.columns.map((c) => {
      const next = mapList(
        c.blocks,
        { region: loc.region, parentId: b.id, columnId: c.id },
        visit,
      );
      if (next === c.blocks) return c;
      colsChanged = true;
      return { ...c, blocks: next };
    });
    if (!colsChanged) return b;
    changed = true;
    return { ...b, data: { ...b.data, columns } };
  });
  return visit(changed ? inner : blocks, loc);
}

function mapDesign(design: EmailDesign, visit: Visit): EmailDesign {
  let out = design;
  for (const region of REGIONS) {
    const prev = design[region]?.blocks ?? [];
    const next = mapList(
      prev,
      { region, parentId: null, columnId: null },
      visit,
    );
    if (next !== prev) out = { ...out, [region]: { blocks: next } };
  }
  return out;
}

function eachList(
  design: EmailDesign,
  fn: (blocks: Block[], loc: ListLoc) => void,
) {
  const walk = (blocks: Block[], loc: ListLoc) => {
    fn(blocks, loc);
    for (const b of blocks) {
      if (b.type !== "columns") continue;
      for (const c of b.data.columns) {
        walk(c.blocks, { region: loc.region, parentId: b.id, columnId: c.id });
      }
    }
  };
  for (const region of REGIONS) {
    walk(design[region]?.blocks ?? [], {
      region,
      parentId: null,
      columnId: null,
    });
  }
}

const sameList = (a: ListLoc, b: DropTarget) =>
  a.region === b.region &&
  (a.parentId ?? null) === (b.parentId ?? null) &&
  (a.columnId ?? null) === (b.columnId ?? null);

export function findBlock(design: EmailDesign, id: string): Block | null {
  let found: Block | null = null;
  eachList(design, (blocks) => {
    found ??= blocks.find((b) => b.id === id) ?? null;
  });
  return found;
}

export function locateBlock(
  design: EmailDesign,
  id: string,
): (ListLoc & { index: number; size: number }) | null {
  let found: (ListLoc & { index: number; size: number }) | null = null;
  eachList(design, (blocks, loc) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (!found && index >= 0) found = { ...loc, index, size: blocks.length };
  });
  return found;
}

function containsId(block: Block, id: string): boolean {
  if (block.id === id) return true;
  return (
    block.type === "columns" &&
    block.data.columns.some((c) => c.blocks.some((b) => containsId(b, id)))
  );
}

// ── edits ─────────────────────────────────────────────────────────────────

export interface BlockPatch {
  data?: Record<string, unknown>;
  style?: Record<string, unknown>;
}

/** Shallow-merge `patch.data` into the block's data and `patch.style` into its style. */
export function updateBlock(
  design: EmailDesign,
  id: string,
  patch: BlockPatch,
): EmailDesign {
  return mapDesign(design, (blocks) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return blocks;
    const b = blocks[i];
    const next = {
      ...b,
      data: patch.data ? { ...b.data, ...patch.data } : b.data,
      style: patch.style ? { ...b.style, ...patch.style } : b.style,
    } as Block;
    return [...blocks.slice(0, i), next, ...blocks.slice(i + 1)];
  });
}

export function removeBlock(design: EmailDesign, id: string): EmailDesign {
  return mapDesign(design, (blocks) =>
    blocks.some((b) => b.id === id)
      ? blocks.filter((b) => b.id !== id)
      : blocks,
  );
}

export function insertBlock(
  design: EmailDesign,
  block: Block,
  target: DropTarget,
): EmailDesign {
  return mapDesign(design, (blocks, loc) => {
    if (!sameList(loc, target)) return blocks;
    const at = Math.max(
      0,
      Math.min(target.index ?? blocks.length, blocks.length),
    );
    return [...blocks.slice(0, at), block, ...blocks.slice(at)];
  });
}

/** Move a block to a list position. A move into the block itself (a columns
 *  block into one of its own columns) is refused: the design comes back as is. */
export function moveBlock(
  design: EmailDesign,
  id: string,
  target: DropTarget,
): EmailDesign {
  const from = locateBlock(design, id);
  const block = findBlock(design, id);
  if (!from || !block) return design;
  if (target.parentId && containsId(block, target.parentId)) return design;
  let index = target.index ?? Number.MAX_SAFE_INTEGER;
  if (sameList(from, target) && from.index < index) index -= 1;
  if (sameList(from, target) && from.index === index) return design;
  return insertBlock(removeBlock(design, id), block, { ...target, index });
}

/** Move a block one place up (-1) or down (+1) within its own list. */
export function moveBlockBy(
  design: EmailDesign,
  id: string,
  delta: number,
): EmailDesign {
  const from = locateBlock(design, id);
  if (!from) return design;
  const to = from.index + delta;
  if (to < 0 || to >= from.size) return design;
  const block = findBlock(design, id)!;
  return insertBlock(removeBlock(design, id), block, { ...from, index: to });
}

/** A deep copy with fresh ids for the block, its columns, nested blocks and list items. */
export function cloneWithNewIds(block: Block): Block {
  const copy = structuredClone(block) as Block;
  const renew = (b: Block): Block => {
    b.id = mintBlockId();
    if (b.type === "columns") {
      b.data.columns = b.data.columns.map(
        (c): Column => ({
          ...c,
          id: mintBlockId(),
          blocks: c.blocks.map(renew),
        }),
      );
    }
    if (b.type === "list") {
      b.data.items = b.data.items.map((item) => ({
        ...item,
        id: mintBlockId(),
      }));
    }
    return b;
  };
  return renew(copy);
}

/** Copy a block in place (right after itself). Returns the new design and the copy's id. */
export function duplicateBlock(
  design: EmailDesign,
  id: string,
): { design: EmailDesign; id: string | null } {
  const from = locateBlock(design, id);
  const block = findBlock(design, id);
  if (!from || !block) return { design, id: null };
  const copy = cloneWithNewIds(block);
  return {
    design: insertBlock(design, copy, { ...from, index: from.index + 1 }),
    id: copy.id,
  };
}

// ── brand tokens ──────────────────────────────────────────────────────────

const TOKEN = /^brand:([A-Za-z]+)$/;

/** The design with every "brand:<token>" value replaced by the kit's colour or
 *  font. An unknown token falls back to black, or the body font on a font field. */
export function resolveDesign<T>(design: T, kit: BrandKit): T {
  const walk = (value: unknown, key: string): unknown => {
    if (typeof value === "string") {
      const m = TOKEN.exec(value);
      if (!m) return value;
      const token = m[1];
      if (token === "heading") return kit.fonts.heading;
      if (token === "body") return kit.fonts.body;
      return (
        kit.colors[token] ?? (/font/i.test(key) ? kit.fonts.body : "#000000")
      );
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (isObject(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v, k);
      return out;
    }
    return value;
  };
  return walk(design, "") as T;
}

/** "brand:primary" -> "primary"; anything else -> null. */
export function tokenName(value: unknown): string | null {
  return typeof value === "string" ? (TOKEN.exec(value)?.[1] ?? null) : null;
}

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** The merge variables a piece of text uses ({{FirstName}} -> "FirstName"). */
export function variablesIn(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((m) => m[1]))];
}
