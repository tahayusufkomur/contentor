"use client";

import {
  Eye,
  Monitor,
  PencilLine,
  Redo2,
  Smartphone,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { Canvas } from "./canvas/canvas";
import { EditorDnd } from "./canvas/dnd";
import { PanelTabs, Palette, SettingsPanel } from "./panels/side-panels";
import { PreviewPane } from "./preview";
import { EmailEditorProvider, useEmailEditor } from "./store";
import type {
  Block,
  BrandKit,
  CatalogItem,
  EditorFeatures,
  EmailDesign,
  ImageValue,
} from "./types";

export interface EmailEditorProps {
  /** The design it opens with; the editor owns it from then on (see syncKey). */
  value: EmailDesign;
  /** Every content change (not the opening design, not a sync). Debounce the save. */
  onChange: (design: EmailDesign) => void;
  /** Change it to replace the design with the current `value` as one undoable
   *  step (the Designer finished, a draft was reloaded). */
  syncKey?: number | string;
  kit: BrandKit;
  items?: CatalogItem[];
  features?: Partial<EditorFeatures>;
  pickImage: () => Promise<ImageValue | null>;
  /** May return a site-relative path ("/courses/x"); "" removes a link; null cancels. */
  pickLink: (current: string) => Promise<string | null>;
  pickItem?: () => Promise<CatalogItem | null>;
  /** The server's HTML for Preview. */
  renderPreview: (design: EmailDesign) => Promise<string>;
  /** The block she selected (null when none), for the page around the editor. */
  onSelect?: (block: Block | null) => void;
  className?: string;
}

const NO_ITEMS: CatalogItem[] = [];

/** The native email editor: palette, canvas and settings in Contentor's UI, the
 *  same interaction as the site editor. Give it a height (it fills it). */
export function EmailEditor({
  value,
  onChange,
  syncKey,
  kit,
  items = NO_ITEMS,
  features,
  pickImage,
  pickLink,
  pickItem,
  renderPreview,
  onSelect,
  className,
}: EmailEditorProps) {
  // The page may hand in fresh callbacks on every render; the editor keeps
  // stable ones that call the latest.
  const latest = useRef({
    pickImage,
    pickLink,
    pickItem,
    renderPreview,
    onSelect,
  });
  latest.current = { pickImage, pickLink, pickItem, renderPreview, onSelect };
  const stablePickImage = useCallback(() => latest.current.pickImage(), []);
  const stablePickLink = useCallback(
    (current: string) => latest.current.pickLink(current),
    [],
  );
  const stablePickItem = useCallback(
    () => latest.current.pickItem?.() ?? Promise.resolve(null),
    [],
  );
  const stableRender = useCallback(
    (d: EmailDesign) => latest.current.renderPreview(d),
    [],
  );
  const stableOnSelect = useCallback(
    (block: Block | null) => latest.current.onSelect?.(block),
    [],
  );

  const itemsOn = features?.items ?? true;
  const brandOn = features?.brand ?? true;
  const feats = useMemo(
    () => ({ items: itemsOn, brand: brandOn }),
    [itemsOn, brandOn],
  );

  return (
    <EmailEditorProvider
      value={value}
      onChange={onChange}
      syncKey={syncKey}
      kit={kit}
      items={items}
      features={feats}
      pickImage={stablePickImage}
      pickLink={stablePickLink}
      pickItem={pickItem ? stablePickItem : undefined}
      renderPreview={stableRender}
    >
      <EditorDnd>
        <EditorLayout className={className} onSelect={stableOnSelect} />
      </EditorDnd>
    </EmailEditorProvider>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  );
}

const barBtn =
  "flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

function EditorLayout({
  className,
  onSelect,
}: {
  className?: string;
  onSelect: (block: Block | null) => void;
}) {
  const store = useEmailEditor();
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [tab, setTab] = useState<"add" | "edit">("add");

  // Small screens: picking a block opens its settings.
  const selectedId = store.selectedId;
  useEffect(() => {
    if (selectedId) setTab("edit");
  }, [selectedId]);

  // Shortcuts while the editor (or nothing in particular) has focus; never
  // while she is typing, where the text field's own undo and Delete apply.
  const keys = useRef(store);
  keys.current = store;
  useEffect(() => {
    onSelect(keys.current.selected);
  }, [selectedId, onSelect]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = keys.current;
      const active = document.activeElement;
      const inEditor =
        !!root.current &&
        (root.current.contains(active) || active === document.body);
      if (!inEditor || isTyping(e.target) || mode !== "edit") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        s.selectedId
      ) {
        e.preventDefault();
        s.remove(s.selectedId);
      } else if (e.key === "Escape" && s.selectedId) {
        s.select(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  return (
    <div
      ref={root}
      className={cn(
        "flex h-full min-h-[560px] flex-col overflow-hidden rounded-xl border bg-background text-foreground",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <button
          type="button"
          className={barBtn}
          onClick={store.undo}
          disabled={!store.canUndo || mode !== "edit"}
          title="Undo (⌘Z)"
          aria-label="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={barBtn}
          onClick={store.redo}
          disabled={!store.canRedo || mode !== "edit"}
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          {mode === "preview" && (
            <div
              className="mr-1 flex rounded-md border p-0.5"
              role="group"
              aria-label="Preview size"
            >
              {(
                [
                  ["desktop", Monitor, "Desktop"],
                  ["mobile", Smartphone, "Phone"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={device === value}
                  title={label}
                  aria-label={label}
                  onClick={() => setDevice(value)}
                  className={cn(
                    "flex h-7 w-8 items-center justify-center rounded text-muted-foreground",
                    device === value && "bg-accent text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
          <div
            className="flex rounded-md border p-0.5"
            role="group"
            aria-label="Mode"
          >
            {(
              [
                ["edit", PencilLine, "Edit"],
                ["preview", Eye, "Preview"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded px-2.5 text-sm text-muted-foreground",
                  mode === value && "bg-accent font-medium text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="min-h-0 flex-1">
          <PreviewPane
            design={store.design}
            device={device}
            renderPreview={store.renderPreview}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(200px,232px)_minmax(0,1fr)_minmax(280px,320px)]">
          <aside
            aria-label="Add blocks"
            className="hidden min-h-0 overflow-y-auto border-r bg-muted/20 lg:block"
          >
            <Palette />
          </aside>
          <div className="min-h-[320px] flex-1 overflow-y-auto lg:min-h-0">
            <Canvas />
          </div>
          <aside
            aria-label="Block settings"
            className="hidden min-h-0 overflow-y-auto border-l lg:block"
          >
            <SettingsPanel />
          </aside>
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-t lg:hidden">
            <div className="sticky top-0 z-10 bg-background p-2">
              <PanelTabs value={tab} onChange={setTab} />
            </div>
            {tab === "add" ? (
              <Palette onAdded={() => setTab("edit")} />
            ) : (
              <SettingsPanel />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
