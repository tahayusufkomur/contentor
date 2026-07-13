"use client";

import { useTranslations } from "next-intl";

import type { WizardCatalog } from "@/lib/wizard/types";

import { MiniPageSketch } from "./previews";
import { OptionCard, SlideHeader } from "./steps";

/** Block-type sequence for a layout thumbnail, with home-page goal blocks
 * spliced in after courseGrid — mirrors backend compose ordering. */
export function thumbnailBlocks(catalog: WizardCatalog, page: string, layoutBlocks: string[], goals: string[]): string[] {
  if (page !== "home") return layoutBlocks;
  const extra: string[] = [];
  for (const gb of catalog.home_goal_blocks) {
    if (goals.includes(gb.goal) && !extra.includes(gb.type)) extra.push(gb.type);
  }
  const idx = layoutBlocks.indexOf("courseGrid");
  if (idx === -1) return [...layoutBlocks, ...extra];
  return [...layoutBlocks.slice(0, idx + 1), ...extra, ...layoutBlocks.slice(idx + 1)];
}

export function PageLayoutStep({
  catalog, page, value, onChange, theme, goals,
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
      <SlideHeader heading={t(`pages.titles.${page}`)} subhead={t("pages.subhead")} />
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {options.map((option, i) => (
          <OptionCard
            key={option.id}
            selected={value === option.id}
            onSelect={() => onChange(option.id)}
            title={t(`layouts.${option.id}`)}
            badge={i === 0 ? t("common.recommended") : undefined}
          >
            <MiniPageSketch blocks={thumbnailBlocks(catalog, page, option.blocks, goals)} theme={theme} />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}
