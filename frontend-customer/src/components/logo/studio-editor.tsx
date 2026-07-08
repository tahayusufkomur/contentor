"use client";

import { useState } from "react";
import type { LogoRecipe } from "@/types/logo";
import { MarkRenderer } from "./logo-renderer";
import { StudioCanvas, type ElementKey } from "./studio-canvas";
import { StudioPanel } from "./studio-panel";

interface StudioEditorProps {
  recipe: LogoRecipe;
  onPatch: (part: Partial<LogoRecipe>) => void;
  onUpdate: (updater: (r: LogoRecipe) => LogoRecipe) => void;
  primaryHex: string;
  onGetNewIdeas: () => void;
  onUploadMark: (file: File) => void;
  logoSvgRef: React.RefObject<SVGSVGElement>;
  markSvgRef: React.RefObject<SVGSVGElement>;
}

/** Step 3 · Editor — direct-manipulation canvas + contextual panel + the
 * real-context previews (browser tab, app icon) that ground the design. */
export function StudioEditor({
  recipe,
  onPatch,
  onUpdate,
  primaryHex,
  onGetNewIdeas,
  onUploadMark,
  logoSvgRef,
  markSvgRef,
}: StudioEditorProps) {
  const [selected, setSelected] = useState<ElementKey | null>(null);
  const [dark, setDark] = useState(false);

  // Deselect the tagline if it stops existing (cleared text) — its canvas
  // group unmounts, so a stale selection would point at nothing.
  if (selected === "tagline" && !recipe.tagline.trim()) setSelected(null);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-6 overflow-y-auto bg-muted/40 p-8">
        <StudioCanvas
          recipe={recipe}
          selected={selected}
          onSelect={setSelected}
          onChange={(next) => onUpdate(() => next)}
          dark={dark}
          onToggleDark={() => setDark((v) => !v)}
          logoSvgRef={logoSvgRef}
        />
        {/* Favicon + home-screen context */}
        <div className="flex items-end gap-8">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-t-lg border bg-white px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <MarkRenderer recipe={recipe} size={16} />
              {recipe.name}
            </div>
            <span className="text-xs text-muted-foreground">Browser tab</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="overflow-hidden rounded-2xl shadow-md">
              <MarkRenderer recipe={recipe} size={64} svgRef={markSvgRef} />
            </div>
            <span className="text-xs text-muted-foreground">App icon</span>
          </div>
        </div>
      </div>

      <StudioPanel
        recipe={recipe}
        selected={selected}
        onPatch={onPatch}
        onUpdate={onUpdate}
        primaryHex={primaryHex}
        onGetNewIdeas={onGetNewIdeas}
        onUploadMark={onUploadMark}
      />
    </div>
  );
}
