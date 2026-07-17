"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { WizardCatalog } from "@/lib/wizard/types";

import { BrowserFrame, MiniPageSketch } from "./previews";
import { OptionCard, OptionList, SlideHeader } from "./steps";

/** Block-type sequence for a layout thumbnail, with home-page goal blocks
 * spliced in after courseGrid — mirrors backend compose ordering. */
export function thumbnailBlocks(
  catalog: WizardCatalog,
  page: string,
  layoutBlocks: string[],
  goals: string[],
): string[] {
  if (page !== "home") return layoutBlocks;
  const extra: string[] = [];
  for (const gb of catalog.home_goal_blocks) {
    if (goals.includes(gb.goal) && !extra.includes(gb.type))
      extra.push(gb.type);
  }
  const idx = layoutBlocks.indexOf("courseGrid");
  if (idx === -1) return [...layoutBlocks, ...extra];
  return [
    ...layoutBlocks.slice(0, idx + 1),
    ...extra,
    ...layoutBlocks.slice(idx + 1),
  ];
}

/** Real screenshot (tools/wizard-mockups/capture.mjs) when one has been
 * captured for this layout id, falling back to the abstract wireframe
 * otherwise — so a layout added to the catalog before its screenshot
 * exists never shows a broken image. Shown uncropped inside browser chrome:
 * the coach is choosing a whole page, so cropping it would hide the very
 * blocks that distinguish the two options. alt is empty because the card's
 * visible title already names the layout. */
function LayoutThumbnail({
  layoutId,
  blocks,
  theme,
}: {
  layoutId: string;
  blocks: string[];
  theme?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <BrowserFrame>
      {imageFailed ? (
        <div className="p-2">
          <MiniPageSketch blocks={blocks} theme={theme} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image loader needed
        <img
          src={`/wizard-mockups/${layoutId}.png`}
          alt=""
          className="block w-full"
          onError={() => setImageFailed(true)}
        />
      )}
    </BrowserFrame>
  );
}

export function PageLayoutStep({
  catalog,
  page,
  value,
  onChange,
  theme,
  goals,
}: {
  catalog: WizardCatalog;
  page: string;
  value?: string;
  onChange: (layoutId: string) => void;
  theme?: string;
  goals: string[];
}) {
  const t = useTranslations("wizard");
  const options = catalog.page_layouts[page] ?? [];
  return (
    <div>
      <SlideHeader
        heading={t(`pages.titles.${page}`)}
        subhead={t("pages.subhead")}
      />
      <OptionList className="mx-auto mt-6 grid w-full grid-cols-2 gap-4 md:grid-cols-3">
        {options.map((option, i) => (
          <OptionCard
            key={option.id}
            selected={value === option.id}
            onSelect={() => onChange(option.id)}
            title={t(`layouts.${option.id}`)}
            badge={i === 0 ? t("common.recommended") : undefined}
          >
            <LayoutThumbnail
              layoutId={option.id}
              blocks={thumbnailBlocks(catalog, page, option.blocks, goals)}
              theme={theme}
            />
          </OptionCard>
        ))}
      </OptionList>
    </div>
  );
}
