// MIRRORED FROM frontend-customer/src/components/logo/render-draft.tsx — keep in sync (phase-3 wizard)
// Off-screen rasterizer for AI draft designs — the client half of the
// Design-with-AI two-pass. A turn (or a refine) returns *draft* designs; the
// coach's browser renders them to PNGs and posts those back so the AI can
// critique its own work and return polished finals (see
// backend Task 12 logo_converse_finish / logo_refine finish). Everything here
// runs client-side only (createRoot into a detached, off-screen container),
// and is shared by studio-chat.tsx (chat turns) and logo-studio.tsx (refine).
//
// NOTE (mirror divergence, phase-3 wizard): the source file imports
// `type ChatStage` from `@/lib/logo/converse-api` — that module is NOT
// mirrored into frontend-main (the wizard doesn't need its tenant-authenticated
// fetchers, only this type), so `ChatStage` is defined inline below instead.
// Also, `LogoRenderer`/`MarkRenderer`/`logoViewBox` live at
// `@/components/logo/logo-renderer` in frontend-main (not a `./logo-renderer`
// sibling of this file), so that import path is adjusted accordingly.
"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  composeConverseDesign,
  composeIconPreview,
  type ConverseDesign,
} from "@/lib/logo/composer";
import { svgToPngBlob, type FontSpec } from "@/lib/logo/export";
import type { LogoRecipe } from "@/types/logo";
import {
  LogoRenderer,
  MarkRenderer,
  logoViewBox,
} from "@/components/logo/logo-renderer";

type ChatStage = "icon" | "name" | "tagline";

/** The (family, weight) pairs a recipe actually paints — name always, tagline
 * only when non-empty. Same block handleSave builds for the final export. */
export function fontsFor(recipe: LogoRecipe): FontSpec[] {
  return [
    {
      family: recipe.typography.name.font,
      weight: recipe.typography.name.weight,
    },
    ...(recipe.tagline.trim()
      ? [
          {
            family: recipe.typography.tagline.font,
            weight: recipe.typography.tagline.weight,
          },
        ]
      : []),
  ];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read PNG"));
    reader.readAsDataURL(blob);
  });
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Render a set of recipes off-screen and rasterize each to a data-URL PNG.
 * Icon stage rasterizes the bare mark (MarkRenderer, square 512); later
 * stages rasterize the full lockup (LogoRenderer, 600-wide at the layout's
 * aspect). Best-effort per card — a card that fails to render is skipped, so
 * the caller still gets images for the rest (it always has the raw drafts to
 * fall back on). */
export async function renderRecipesToPngs(
  recipes: LogoRecipe[],
  stage: ChatStage,
): Promise<string[]> {
  if (!recipes.length) return [];
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;pointer-events:none;opacity:0;";
  document.body.appendChild(container);
  const root = createRoot(container);
  const refs: (SVGSVGElement | null)[] = [];
  try {
    flushSync(() => {
      root.render(
        <>
          {recipes.map((recipe, i) =>
            stage === "icon" ? (
              <MarkRenderer
                key={i}
                recipe={recipe}
                size={120}
                svgRef={(el) => {
                  refs[i] = el;
                }}
              />
            ) : (
              <LogoRenderer
                key={i}
                recipe={recipe}
                width={280}
                svgRef={(el) => {
                  refs[i] = el;
                }}
              />
            ),
          )}
        </>,
      );
    });
    // One frame so layout settles and the on-page fonts warm before capture.
    await nextFrame();

    const images: string[] = [];
    for (let i = 0; i < recipes.length; i++) {
      const svg = refs[i];
      const recipe = recipes[i]!;
      if (!svg) continue;
      try {
        const vb =
          stage === "icon" ? { w: 1, h: 1 } : logoViewBox(recipe.layout);
        const blob = await svgToPngBlob(
          svg,
          stage === "icon" ? 512 : 600,
          stage === "icon" ? 512 : Math.round((600 * vb.h) / vb.w),
          fontsFor(recipe),
        );
        images.push(await blobToDataUrl(blob));
      } catch {
        // Skip this card; the caller falls back to the raw drafts overall.
      }
    }
    return images;
  } finally {
    root.unmount();
    container.remove();
  }
}

/** Convenience over renderRecipesToPngs: materialize converse designs into
 * recipes first (icon-preview for the icon stage, full lockup otherwise). */
export function renderDraftPngs(
  designs: ConverseDesign[],
  stage: ChatStage,
  brandName: string,
): Promise<string[]> {
  const recipes = designs.map((d) =>
    stage === "icon"
      ? composeIconPreview(d, brandName)
      : composeConverseDesign(d, brandName),
  );
  return renderRecipesToPngs(recipes, stage);
}
