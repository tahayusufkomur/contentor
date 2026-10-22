"use client";

// The editor's single source of truth while she edits: the design plus undo /
// redo history, selection and hover. Same shape as the site editor's store
// (frontend-customer/src/components/owner/canvas/editor-store.tsx): a reducer,
// typing coalesced into one undo step, and an outside change ("sync") landing
// as one undoable step that is not echoed back as an edit.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import {
  duplicateBlock,
  findBlock,
  insertBlock,
  locateBlock,
  moveBlock,
  moveBlockBy,
  normalizeDesign,
  removeBlock,
  resolveDesign,
  updateBlock,
  type BlockPatch,
} from "./tree";
import type {
  Block,
  BrandKit,
  CatalogItem,
  DropTarget,
  EditorFeatures,
  EmailDesign,
  ImageValue,
  TemplateSettings,
} from "./types";

const HISTORY_LIMIT = 100;
const COALESCE_MS = 700;

export interface EditorState {
  design: EmailDesign;
  past: EmailDesign[];
  future: EmailDesign[];
  selectedId: string | null;
  hoveredId: string | null;
  lastEditKey?: string;
  lastEditAt?: number;
}

export type EditorAction =
  | { type: "insert"; block: Block; target: DropTarget }
  | { type: "update"; id: string; patch: BlockPatch; at?: number }
  | { type: "settings"; patch: Partial<TemplateSettings>; at?: number }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "move"; id: string; target: DropTarget }
  | { type: "moveBy"; id: string; delta: number }
  | { type: "select"; id: string | null }
  | { type: "hover"; id: string | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "sync"; design: EmailDesign };

export function initEditorState(design: EmailDesign): EditorState {
  return { design, past: [], future: [], selectedId: null, hoveredId: null };
}

/** A new design as one undo step (a no-op change leaves history alone). */
function commit(state: EditorState, design: EmailDesign): EditorState {
  if (design === state.design) return state;
  return {
    ...state,
    design,
    past: [...state.past, state.design].slice(-HISTORY_LIMIT),
    future: [],
    lastEditKey: undefined,
    lastEditAt: undefined,
  };
}

/** Typing into one field: consecutive edits of the same keys within
 *  COALESCE_MS fold into the history entry the first one made. */
function coalesced(
  state: EditorState,
  design: EmailDesign,
  key: string,
  at: number | undefined,
): EditorState {
  if (design === state.design) return state;
  const fold =
    at !== undefined &&
    state.lastEditKey === key &&
    state.lastEditAt !== undefined &&
    at - state.lastEditAt < COALESCE_MS;
  if (fold) return { ...state, design, future: [], lastEditAt: at };
  return { ...commit(state, design), lastEditKey: key, lastEditAt: at };
}

const keep = (design: EmailDesign, id: string | null) =>
  id && findBlock(design, id) ? id : null;

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "insert": {
      const design = insertBlock(state.design, action.block, action.target);
      if (design === state.design) return state;
      return { ...commit(state, design), selectedId: action.block.id };
    }
    case "update": {
      const key = `${action.id}|${Object.keys(action.patch.data ?? {}).sort()}|${Object.keys(
        action.patch.style ?? {},
      ).sort()}`;
      return coalesced(
        state,
        updateBlock(state.design, action.id, action.patch),
        key,
        action.at,
      );
    }
    case "settings": {
      const design = {
        ...state.design,
        settings: { ...state.design.settings, ...action.patch },
      };
      const key = `settings|${Object.keys(action.patch).sort()}`;
      return coalesced(state, design, key, action.at);
    }
    case "remove": {
      const next = commit(state, removeBlock(state.design, action.id));
      return { ...next, selectedId: keep(next.design, state.selectedId) };
    }
    case "duplicate": {
      const { design, id } = duplicateBlock(state.design, action.id);
      return id ? { ...commit(state, design), selectedId: id } : state;
    }
    case "move":
      return commit(state, moveBlock(state.design, action.id, action.target));
    case "moveBy":
      return commit(state, moveBlockBy(state.design, action.id, action.delta));
    case "select":
      return state.selectedId === action.id
        ? state
        : { ...state, selectedId: action.id };
    case "hover":
      return state.hoveredId === action.id
        ? state
        : { ...state, hoveredId: action.id };
    case "undo": {
      if (!state.past.length) return state;
      const design = state.past[state.past.length - 1];
      return {
        ...state,
        design,
        past: state.past.slice(0, -1),
        future: [state.design, ...state.future].slice(0, HISTORY_LIMIT),
        selectedId: keep(design, state.selectedId),
        lastEditKey: undefined,
        lastEditAt: undefined,
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      const [design, ...future] = state.future;
      return {
        ...state,
        design,
        past: [...state.past, state.design].slice(-HISTORY_LIMIT),
        future,
        selectedId: keep(design, state.selectedId),
        lastEditKey: undefined,
        lastEditAt: undefined,
      };
    }
    case "sync": {
      const next = commit(state, action.design);
      return { ...next, selectedId: keep(next.design, state.selectedId) };
    }
    default:
      return state;
  }
}

export interface EditorServices {
  kit: BrandKit;
  items: CatalogItem[];
  features: EditorFeatures;
  pickImage: () => Promise<ImageValue | null>;
  pickLink: (current: string) => Promise<string | null>;
  pickItem?: () => Promise<CatalogItem | null>;
  renderPreview: (design: EmailDesign) => Promise<string>;
}

export interface EmailEditorStore extends EditorState, EditorServices {
  /** The design with brand tokens swapped for her colours and fonts (what the canvas draws). */
  resolved: EmailDesign;
  canUndo: boolean;
  canRedo: boolean;
  selected: Block | null;
  insert(block: Block, target: DropTarget): void;
  /** Insert after the selected block (in its list), else at the end of the body. */
  insertNearSelection(block: Block): void;
  update(id: string, patch: BlockPatch): void;
  updateSettings(patch: Partial<TemplateSettings>): void;
  remove(id: string): void;
  duplicate(id: string): void;
  move(id: string, target: DropTarget): void;
  moveBy(id: string, delta: number): void;
  select(id: string | null): void;
  hover(id: string | null): void;
  undo(): void;
  redo(): void;
}

const StoreContext = createContext<EmailEditorStore | null>(null);

export function useEmailEditor(): EmailEditorStore {
  const store = useContext(StoreContext);
  if (!store)
    throw new Error("useEmailEditor must be used inside <EmailEditor>");
  return store;
}

interface ProviderProps extends EditorServices {
  value: EmailDesign;
  onChange: (design: EmailDesign) => void;
  syncKey?: number | string;
  children: React.ReactNode;
}

export function EmailEditorProvider({
  value,
  onChange,
  syncKey,
  children,
  ...services
}: ProviderProps) {
  // Normalised on the way in: a design from an old row or an AI reply opens safely.
  const [state, dispatch] = useReducer(editorReducer, value, (v) =>
    initEditorState(normalizeDesign(v)),
  );

  // Tell the page about every content change (it debounces the save), never
  // about the design it opened with, and never about a sync it just pushed in.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const notified = useRef(state.design);
  const skipEcho = useRef(false);
  useEffect(() => {
    if (state.design === notified.current) return;
    notified.current = state.design;
    if (skipEcho.current) {
      skipEcho.current = false;
      return;
    }
    onChangeRef.current(state.design);
  }, [state.design]);

  // An outside change (the Designer finished, a draft reloaded): adopt `value`.
  const valueRef = useRef(value);
  valueRef.current = value;
  const syncedKey = useRef(syncKey);
  useEffect(() => {
    if (syncKey === syncedKey.current) return;
    syncedKey.current = syncKey;
    skipEcho.current = true;
    dispatch({ type: "sync", design: normalizeDesign(valueRef.current) });
  }, [syncKey]);

  const actions = useMemo(
    () => ({
      insert: (block: Block, target: DropTarget) =>
        dispatch({ type: "insert", block, target }),
      update: (id: string, patch: BlockPatch) =>
        dispatch({ type: "update", id, patch, at: Date.now() }),
      updateSettings: (patch: Partial<TemplateSettings>) =>
        dispatch({ type: "settings", patch, at: Date.now() }),
      remove: (id: string) => dispatch({ type: "remove", id }),
      duplicate: (id: string) => dispatch({ type: "duplicate", id }),
      move: (id: string, target: DropTarget) =>
        dispatch({ type: "move", id, target }),
      moveBy: (id: string, delta: number) =>
        dispatch({ type: "moveBy", id, delta }),
      select: (id: string | null) => dispatch({ type: "select", id }),
      hover: (id: string | null) => dispatch({ type: "hover", id }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
    }),
    [],
  );

  const { kit } = services;
  const resolved = useMemo(
    () => resolveDesign(state.design, kit),
    [state.design, kit],
  );

  const store = useMemo<EmailEditorStore>(() => {
    const selected = state.selectedId
      ? findBlock(state.design, state.selectedId)
      : null;
    return {
      ...state,
      ...services,
      ...actions,
      resolved,
      selected,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      insertNearSelection: (block: Block) => {
        const at = state.selectedId
          ? locateBlock(state.design, state.selectedId)
          : null;
        actions.insert(
          block,
          at ? { ...at, index: at.index + 1 } : { region: "body" },
        );
      },
    };
    // `services` is a fresh object every render; its members are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state,
    actions,
    resolved,
    services.kit,
    services.items,
    services.features,
    services.pickImage,
    services.pickLink,
    services.pickItem,
    services.renderPreview,
  ]);

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}
