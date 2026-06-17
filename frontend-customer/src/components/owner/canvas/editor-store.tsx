"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { mintBlockId } from "@/lib/blocks/registry";
import type { Block, PageKey, PagesConfig } from "@/types/tenant";

// ---------------------------------------------------------------------------
// Editor store — the single client source of truth for page CONTENT while a
// coach is editing. `EditSidebar` still owns the full TenantConfig (brand,
// navbar, theme) and the debounced autosave; this store owns the live `pages`
// tree so the sidebar "Layers" list AND the on-page canvas mutate one shared
// state, with undo/redo. On every content change it calls `onPagesChange`, which
// EditSidebar folds into its existing `handleChange({ pages })` autosave — one
// save path, reused. Selection/hover changes do NOT trigger a save.
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 50;

interface EditorState {
  pages: PagesConfig;
  past: PagesConfig[];
  future: PagesConfig[];
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  // Coalescing: consecutive edits to the same block+field within a short window
  // fold into one undo step (so typing isn't undone character-by-character).
  lastEditKey?: string;
  lastEditAt?: number;
}

const COALESCE_MS = 700;

type Action =
  | { type: "insert"; pageKey: PageKey; block: Block; index?: number }
  | { type: "remove"; pageKey: PageKey; id: string }
  | { type: "duplicate"; pageKey: PageKey; id: string }
  | { type: "reorder"; pageKey: PageKey; from: number; to: number }
  | {
      type: "update";
      pageKey: PageKey;
      id: string;
      patch: Partial<Block>;
      at?: number;
    }
  | { type: "setEnabled"; pageKey: PageKey; id: string; enabled: boolean }
  | { type: "applyTemplate"; pageKey: PageKey; blocks: Block[] }
  | { type: "select"; id: string | null }
  | { type: "hover"; id: string | null }
  | { type: "undo" }
  | { type: "redo" };

function blocksOf(pages: PagesConfig, pageKey: PageKey): Block[] {
  return pages[pageKey]?.blocks ?? [];
}

function withBlocks(
  pages: PagesConfig,
  pageKey: PageKey,
  blocks: Block[],
): PagesConfig {
  return { ...pages, [pageKey]: { ...(pages[pageKey] ?? {}), blocks } };
}

/** Apply a new `pages` tree, pushing the prior one onto the undo stack. */
function commit(state: EditorState, pages: PagesConfig): EditorState {
  return {
    ...state,
    pages,
    past: [...state.past, state.pages].slice(-HISTORY_LIMIT),
    future: [],
    lastEditKey: undefined,
    lastEditAt: undefined,
  };
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "insert": {
      const blocks = blocksOf(state.pages, action.pageKey);
      const at = action.index ?? blocks.length;
      const next = [...blocks.slice(0, at), action.block, ...blocks.slice(at)];
      return {
        ...commit(state, withBlocks(state.pages, action.pageKey, next)),
        selectedBlockId: action.block.id,
      };
    }
    case "remove": {
      const next = blocksOf(state.pages, action.pageKey).filter(
        (b) => b.id !== action.id,
      );
      return {
        ...commit(state, withBlocks(state.pages, action.pageKey, next)),
        selectedBlockId:
          state.selectedBlockId === action.id ? null : state.selectedBlockId,
      };
    }
    case "duplicate": {
      const blocks = blocksOf(state.pages, action.pageKey);
      const i = blocks.findIndex((b) => b.id === action.id);
      if (i < 0) return state;
      const clone: Block = { ...structuredClone(blocks[i]), id: mintBlockId() };
      const next = [...blocks.slice(0, i + 1), clone, ...blocks.slice(i + 1)];
      return {
        ...commit(state, withBlocks(state.pages, action.pageKey, next)),
        selectedBlockId: clone.id,
      };
    }
    case "reorder": {
      const blocks = blocksOf(state.pages, action.pageKey);
      const { from, to } = action;
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= blocks.length ||
        to >= blocks.length
      )
        return state;
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return commit(state, withBlocks(state.pages, action.pageKey, next));
    }
    case "update": {
      const next = blocksOf(state.pages, action.pageKey).map((b) =>
        b.id === action.id ? { ...b, ...action.patch } : b,
      );
      const newPages = withBlocks(state.pages, action.pageKey, next);
      const keys = Object.keys(action.patch);
      const coalesceKey =
        keys.length === 1 ? `${action.id}:${keys[0]}` : undefined;
      const canCoalesce =
        coalesceKey !== undefined &&
        state.lastEditKey === coalesceKey &&
        action.at !== undefined &&
        state.lastEditAt !== undefined &&
        action.at - state.lastEditAt < COALESCE_MS;
      if (canCoalesce) {
        // Same field still being edited — fold into the current history entry.
        return { ...state, pages: newPages, future: [], lastEditAt: action.at };
      }
      return {
        ...commit(state, newPages),
        lastEditKey: coalesceKey,
        lastEditAt: action.at,
      };
    }
    case "setEnabled": {
      const next = blocksOf(state.pages, action.pageKey).map((b) =>
        b.id === action.id ? { ...b, enabled: action.enabled } : b,
      );
      return commit(state, withBlocks(state.pages, action.pageKey, next));
    }
    case "applyTemplate": {
      // Replace the page's blocks with a deep clone of the template, minting
      // fresh ids so they never collide with anything else on the site.
      const next = action.blocks.map((b) => ({
        ...structuredClone(b),
        id: mintBlockId(),
        enabled: b.enabled !== false,
      }));
      return {
        ...commit(state, withBlocks(state.pages, action.pageKey, next)),
        selectedBlockId: null,
      };
    }
    case "select":
      return state.selectedBlockId === action.id
        ? state
        : { ...state, selectedBlockId: action.id };
    case "hover":
      return state.hoveredBlockId === action.id
        ? state
        : { ...state, hoveredBlockId: action.id };
    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        pages: prev,
        past: state.past.slice(0, -1),
        future: [state.pages, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        pages: next,
        past: [...state.past, state.pages],
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

export interface EditorStore extends EditorState {
  canUndo: boolean;
  canRedo: boolean;
  blocksFor(pageKey: PageKey): Block[];
  insertBlock(pageKey: PageKey, block: Block, index?: number): void;
  removeBlock(pageKey: PageKey, id: string): void;
  duplicateBlock(pageKey: PageKey, id: string): void;
  reorderBlocks(pageKey: PageKey, from: number, to: number): void;
  updateBlock(pageKey: PageKey, id: string, patch: Partial<Block>): void;
  setBlockEnabled(pageKey: PageKey, id: string, enabled: boolean): void;
  applyTemplate(pageKey: PageKey, blocks: Block[]): void;
  selectBlock(id: string | null): void;
  hoverBlock(id: string | null): void;
  undo(): void;
  redo(): void;
}

const EditorStoreContext = createContext<EditorStore | null>(null);

/** Read the editor store. Only valid inside `EditorStoreProvider` (coach edit mode). */
export function useEditorStore(): EditorStore {
  const ctx = useContext(EditorStoreContext);
  if (!ctx)
    throw new Error(
      "useEditorStore must be used within an EditorStoreProvider",
    );
  return ctx;
}

/** Read the editor store if present — returns null on the public/student path. */
export function useOptionalEditorStore(): EditorStore | null {
  return useContext(EditorStoreContext);
}

interface EditorStoreProviderProps {
  initialPages: PagesConfig | undefined;
  onPagesChange: (pages: PagesConfig) => void;
  children: React.ReactNode;
}

export function EditorStoreProvider({
  initialPages,
  onPagesChange,
  children,
}: EditorStoreProviderProps) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    pages: initialPages ?? {},
    past: [],
    future: [],
    selectedBlockId: null,
    hoveredBlockId: null,
  }));

  // Notify the parent (→ debounced autosave) whenever page content changes,
  // skipping the initial mount so loading the editor never triggers a save.
  const onPagesChangeRef = useRef(onPagesChange);
  onPagesChangeRef.current = onPagesChange;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onPagesChangeRef.current(state.pages);
  }, [state.pages]);

  const store = useMemo<EditorStore>(
    () => ({
      ...state,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      blocksFor: (pageKey) => state.pages[pageKey]?.blocks ?? [],
      insertBlock: (pageKey, block, index) =>
        dispatch({ type: "insert", pageKey, block, index }),
      removeBlock: (pageKey, id) => dispatch({ type: "remove", pageKey, id }),
      duplicateBlock: (pageKey, id) =>
        dispatch({ type: "duplicate", pageKey, id }),
      reorderBlocks: (pageKey, from, to) =>
        dispatch({ type: "reorder", pageKey, from, to }),
      updateBlock: (pageKey, id, patch) =>
        dispatch({ type: "update", pageKey, id, patch, at: Date.now() }),
      setBlockEnabled: (pageKey, id, enabled) =>
        dispatch({ type: "setEnabled", pageKey, id, enabled }),
      applyTemplate: (pageKey, blocks) =>
        dispatch({ type: "applyTemplate", pageKey, blocks }),
      selectBlock: (id) => dispatch({ type: "select", id }),
      hoverBlock: (id) => dispatch({ type: "hover", id }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
    }),
    [state],
  );

  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  );
}
