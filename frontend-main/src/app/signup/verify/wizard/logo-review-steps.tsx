"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { getCuratedLogos } from "@/lib/wizard/api";
import type { CuratedLogoItem, WizardAnswers, WizardCatalog, WizardLogoAnswer } from "@/lib/wizard/types";
import { FONT_STACKS, THEME_SWATCHES } from "@/lib/wizard/wizard-themes";

import { OptionCard, SlideHeader } from "./steps";

export function LogoStep({
  brand, niche, theme, font, value, onChange,
}: {
  brand: string;
  niche?: string;
  theme?: string;
  font?: string;
  value?: WizardLogoAnswer;
  onChange: (logo: WizardLogoAnswer) => void;
}) {
  const t = useTranslations("wizard");
  const [items, setItems] = useState<CuratedLogoItem[]>([]);
  useEffect(() => {
    getCuratedLogos().then(setItems).catch(() => setItems([]));
  }, []);

  // Niche-tagged marks first (lightweight port of the Logo Studio ranking).
  const ranked = useMemo(() => {
    const n = (niche ?? "").toLowerCase().replace("_", " ");
    return [...items].sort(
      (a, b) =>
        Number(b.tags.toLowerCase().includes(n)) - Number(a.tags.toLowerCase().includes(n)),
    );
  }, [items, niche]);

  const s = THEME_SWATCHES[theme ?? ""] ?? THEME_SWATCHES.ocean;
  const stack = FONT_STACKS[font ?? "Inter"] ?? FONT_STACKS.Inter;
  const mode = value?.mode ?? "wordmark";

  return (
    <div>
      <SlideHeader heading={t("logo.heading")} subhead={t("logo.subhead")} />

      <div className="mt-5 flex flex-col gap-2.5">
        <OptionCard
          selected={mode === "wordmark"}
          onSelect={() => onChange({ mode: "wordmark", curated_id: null })}
          title={t("logo.wordmark.title")}
          subtitle={t("logo.wordmark.desc")}
        >
          <span className="rounded-lg bg-white px-4 py-3 text-[20px] font-bold tracking-tight" style={{ color: s.ink, fontFamily: stack }}>
            {brand}
          </span>
        </OptionCard>

        <div>
          <p className="mb-2 mt-2 text-[12.5px] font-semibold text-muted-foreground">
            {t("logo.curated.title")} — {t("logo.curated.desc")}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {ranked.slice(0, 8).map((item) => (
              <OptionCard
                key={item.id}
                selected={mode === "curated" && value?.curated_id === item.id}
                onSelect={() => onChange({ mode: "curated", curated_id: item.id })}
                title={item.title}
              >
                <span className="flex items-center gap-2 rounded-lg bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL */}
                  <img src={item.image_url} alt={item.title} className="h-10 w-10 object-contain" />
                  <span className="truncate text-[12px] font-semibold" style={{ color: s.ink, fontFamily: stack }}>{brand}</span>
                </span>
              </OptionCard>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/[0.15] px-4 py-3.5 opacity-70">
          <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold">{t("logo.ai.title")}</span>
            <span className="block text-[11.5px] text-muted-foreground">{t("logo.ai.locked")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function ReviewStep({
  catalog, answers, onEdit,
}: {
  catalog: WizardCatalog;
  answers: WizardAnswers;
  onEdit: (stepId: string) => void;
}) {
  const t = useTranslations("wizard");
  const rows: { key: string; step: string; value: string }[] = [
    { key: "niche", step: "business.niche", value: answers.niche ? t(`niches.${answers.niche}.label`) : "—" },
    { key: "description", step: "business.describe", value: answers.description ? `${answers.description.slice(0, 60)}${answers.description.length > 60 ? "…" : ""}` : "—" },
    { key: "goals", step: "business.goals", value: (answers.goals ?? []).map((g) => t(`goals.items.${g}`)).join(", ") || "—" },
    { key: "theme", step: "look.theme", value: answers.theme ? t(`themes.${answers.theme}`) : "—" },
    { key: "font", step: "look.font", value: answers.font_family ?? "—" },
    { key: "navbar", step: "look.navbar", value: answers.navbar_layout ? t(`navbarLayouts.${answers.navbar_layout}`) : "—" },
    { key: "hero", step: "look.hero", value: answers.hero_style ? t(`heroStyles.${answers.hero_style}.label`) : "—" },
    { key: "pages", step: "pages.home", value: Object.values(answers.page_layouts ?? {}).map((id) => t(`layouts.${id}`)).join(" · ") || t("common.recommended") },
    { key: "logo", step: "logo", value: answers.logo?.mode === "curated" ? t("logo.curated.title") : t("logo.wordmark.title") },
  ];
  return (
    <div>
      <SlideHeader heading={t("review.heading")} subhead={t("review.subhead")} />
      <ul className="mt-5 divide-y divide-foreground/[0.06] rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 px-4 py-3">
            <span className="w-24 flex-shrink-0 text-[12px] font-medium text-muted-foreground">{t(`review.rows.${row.key}`)}</span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{row.value}</span>
            <button
              type="button"
              onClick={() => onEdit(row.step)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/70 transition-colors hover:bg-foreground/[0.1]"
              aria-label={t("review.edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
