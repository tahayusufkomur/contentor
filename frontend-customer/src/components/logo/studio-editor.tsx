"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildBrandKit, darkVariant } from "@/lib/logo/brand-kit";
import type { LogoRecipe } from "@/types/logo";
import { logoViewBox, LogoRenderer, MarkRenderer } from "./logo-renderer";
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
  const [kitBuilding, setKitBuilding] = useState(false);
  const [kitNote, setKitNote] = useState<string | null>(null);
  const darkSvgRef = useRef<SVGSVGElement>(null);
  const darkRecipe = darkVariant(recipe);

  // Deselect the tagline if it stops existing (cleared text) — its canvas
  // group unmounts, so a stale selection would point at nothing.
  if (selected === "tagline" && !recipe.tagline.trim()) setSelected(null);

  async function downloadBrandKit() {
    if (!logoSvgRef.current || !darkSvgRef.current || !markSvgRef.current)
      return;
    setKitBuilding(true);
    setKitNote(null);
    try {
      const { blob, svgIncluded } = await buildBrandKit({
        lightSvg: logoSvgRef.current,
        darkSvg: darkSvgRef.current,
        markSvg: markSvgRef.current,
        recipe,
        darkRecipe,
        viewBox: logoViewBox(recipe.layout),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "brand-kit.zip";
      a.click();
      URL.revokeObjectURL(url);
      if (!svgIncluded) {
        setKitNote(
          "Fonts couldn't be fetched, so the kit contains PNGs only (no SVG).",
        );
      }
    } catch {
      setKitNote("Could not build the brand kit — please try again.");
    } finally {
      setKitBuilding(false);
    }
  }

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

        {/* Brand kit: transparent PNGs (light + dark), favicon sizes, and a
            true vector SVG (text converted to paths). */}
        <div className="flex flex-col items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={kitBuilding}
            onClick={downloadBrandKit}
          >
            {kitBuilding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download brand kit (.zip)
          </Button>
          <p className="text-xs text-muted-foreground">
            PNGs for light &amp; dark, favicon sizes, and a vector SVG.
          </p>
          {kitNote && <p className="text-xs text-destructive">{kitNote}</p>}
        </div>

        {/* Hidden dark-variant renderer feeding the brand kit export. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed -left-[10000px] top-0"
        >
          <LogoRenderer recipe={darkRecipe} width={320} svgRef={darkSvgRef} />
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
