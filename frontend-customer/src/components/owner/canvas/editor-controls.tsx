"use client";

import { useEffect, useRef } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { useEditorStore } from "./editor-store";

const btn =
  "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

/** Undo/redo buttons + keyboard shortcuts (⌘/Ctrl+Z, ⌘⇧Z / Ctrl+Y). Lives in the
 *  sidebar header (inside the editor store provider). Keyboard shortcuts are
 *  ignored while typing in an input/textarea/contentEditable so native text undo
 *  keeps working there. */
export function UndoRedoControls() {
  const store = useEditorStore();
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        storeRef.current.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        storeRef.current.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={store.undo}
        disabled={!store.canUndo}
        className={btn}
        title="Undo (⌘Z)"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={store.redo}
        disabled={!store.canRedo}
        className={btn}
        title="Redo (⌘⇧Z)"
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}
