"use client";

import { Redo2, Undo2 } from "lucide-react";
import type { LogoAiStatus } from "@/lib/logo/converse-api";
import type { LogoRecipe } from "@/types/logo";
import type { ElementKey } from "../studio-canvas";
import { RefinePromptBox } from "./refine-prompt-box";
import { TextControls } from "./text-controls";
import { MarkControls } from "./mark-controls";
import { GlobalControls } from "./global-controls";

export interface StudioPanelProps {
  recipe: LogoRecipe;
  selected: ElementKey | null;
  onPatch: (part: Partial<LogoRecipe>, coalesceKey?: string) => void;
  onUpdate: (
    updater: (r: LogoRecipe) => LogoRecipe,
    coalesceKey?: string,
  ) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  logoAiStatus: LogoAiStatus | null;
  refining: boolean;
  refineNotice: string | null;
  onRefine: (instruction: string, redrawMark: boolean) => void;
  primaryHex: string;
  onGetNewIdeas: () => void;
  onUploadMark: (file: File) => void;
}

/** Contextual controls rail: shows the selected element's controls, or the
 * global sections (layout / palette / badge) when nothing is selected. */
export function StudioPanel(props: StudioPanelProps) {
  const {
    selected,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    logoAiStatus,
    refining,
    refineNotice,
    onRefine,
  } = props;
  return (
    <div className="w-80 shrink-0 space-y-6 overflow-y-auto border-l p-5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
          className="rounded-md border p-1.5 text-muted-foreground hover:border-foreground disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
          className="rounded-md border p-1.5 text-muted-foreground hover:border-foreground disabled:opacity-40"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>
      <RefinePromptBox
        logoAiStatus={logoAiStatus}
        refining={refining}
        refineNotice={refineNotice}
        onRefine={onRefine}
      />
      {selected === null && <GlobalControls {...props} />}
      {(selected === "name" || selected === "tagline") && (
        <TextControls {...props} element={selected} />
      )}
      {selected === "mark" && <MarkControls {...props} />}
    </div>
  );
}
