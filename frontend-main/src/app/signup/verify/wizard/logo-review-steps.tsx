"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  applyAiRank,
  briefKeywords,
  rankCuratedLogos,
} from "@shared/logo/curated-rank";

import { getCuratedLogos, readWizardState } from "@/lib/wizard/api";
import type {
  CuratedLogoItem,
  WizardAnswers,
  WizardCatalog,
  WizardLogoAnswer,
} from "@/lib/wizard/types";
import { FONT_STACKS, THEME_SWATCHES } from "@/lib/wizard/wizard-themes";

import { AiLogoDoor } from "./ai-logo";
import {
  OptionCard,
  OptionList,
  SlideHeader,
  itemVariants,
  listVariants,
} from "./steps";

export function LogoStep({
  token,
  brand,
  niche,
  description,
  theme,
  font,
  value,
  onChange,
  initialUpgraded,
  checkoutSessionId,
}: {
  token: string;
  brand: string;
  niche?: string;
  description?: string;
  theme?: string;
  font?: string;
  value?: WizardLogoAnswer;
  onChange: (logo: WizardLogoAnswer) => void;
  initialUpgraded?: boolean;
  checkoutSessionId?: string;
}) {
  const t = useTranslations("wizard");
  const [items, setItems] = useState<CuratedLogoItem[]>([]);
  useEffect(() => {
    getCuratedLogos()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const [aiRank, setAiRank] = useState<number[] | undefined>(undefined);
  useEffect(() => {
    // Server-side AI rank computed while the coach walked the look/pages
    // chapters; absent (task still running / AI off) -> keyword rank only.
    readWizardState(token)
      .then((res) => setAiRank(res.state.curated_logo_rank))
      .catch(() => setAiRank(undefined));
  }, [token]);

  // Marks matching the coach's niche and their own description first (same
  // ranking as the Logo Studio's Browse entrance), with the server AI rank
  // overlaid on top when it has landed.
  const ranked = useMemo(
    () =>
      applyAiRank(
        rankCuratedLogos(
          items.map((item) => ({
            item,
            title: item.title,
            tags: item.tags
              .split(",")
              .map((tag) => tag.trim().toLowerCase())
              .filter(Boolean),
          })),
          briefKeywords({ niche, description }),
        ).map((ranked) => ranked.item),
        aiRank,
      ),
    [items, niche, description, aiRank],
  );

  const s = THEME_SWATCHES[theme ?? ""] ?? THEME_SWATCHES.ocean;
  const stack = FONT_STACKS[font ?? "Inter"] ?? FONT_STACKS.Inter;
  const mode = value?.mode ?? "wordmark";

  return (
    <div>
      <SlideHeader heading={t("logo.heading")} subhead={t("logo.subhead")} />

      <OptionList className="mt-5 flex flex-col gap-2.5">
        <OptionCard
          selected={mode === "wordmark"}
          onSelect={() => onChange({ mode: "wordmark", curated_id: null })}
          title={t("logo.wordmark.title")}
          subtitle={t("logo.wordmark.desc")}
        >
          <span
            className="rounded-lg bg-white px-4 py-3 text-[20px] font-bold tracking-tight"
            style={{ color: s.ink, fontFamily: stack }}
          >
            {brand}
          </span>
        </OptionCard>

        {ranked.length > 0 && (
          <div>
            <p className="mb-2 mt-2 text-[12.5px] font-semibold text-muted-foreground">
              {t("logo.curated.title")} — {t("logo.curated.desc")}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {ranked.slice(0, 12).map((item) => (
                <OptionCard
                  key={item.id}
                  selected={mode === "curated" && value?.curated_id === item.id}
                  onSelect={() =>
                    onChange({ mode: "curated", curated_id: item.id })
                  }
                  title={item.title}
                >
                  <span className="flex items-center gap-2 rounded-lg bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL */}
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="h-10 w-10 object-contain"
                    />
                    <span
                      className="truncate text-[12px] font-semibold"
                      style={{ color: s.ink, fontFamily: stack }}
                    >
                      {brand}
                    </span>
                  </span>
                </OptionCard>
              ))}
            </div>
          </div>
        )}

        <AiLogoDoor
          token={token}
          brand={brand}
          niche={niche}
          theme={theme}
          value={value}
          onPicked={onChange}
          initialUpgraded={initialUpgraded}
          checkoutSessionId={checkoutSessionId}
        />
      </OptionList>
    </div>
  );
}

export function ReviewStep({
  catalog,
  answers,
  onEdit,
}: {
  catalog: WizardCatalog;
  answers: WizardAnswers;
  onEdit: (stepId: string) => void;
}) {
  const t = useTranslations("wizard");
  const rows: { key: string; step: string; value: string }[] = [
    {
      key: "niche",
      step: "business.niche",
      value: answers.niche ? t(`niches.${answers.niche}.label`) : "—",
    },
    {
      key: "description",
      step: "business.describe",
      value: answers.description
        ? `${answers.description.slice(0, 60)}${answers.description.length > 60 ? "…" : ""}`
        : "—",
    },
    {
      key: "goals",
      step: "business.goals",
      value:
        (answers.goals ?? []).map((g) => t(`goals.items.${g}`)).join(", ") ||
        "—",
    },
    {
      key: "theme",
      step: "look.theme",
      value: answers.theme ? t(`themes.${answers.theme}`) : "—",
    },
    { key: "font", step: "look.font", value: answers.font_family ?? "—" },
    {
      key: "navbar",
      step: "look.navbar",
      value: answers.navbar_layout
        ? t(`navbarLayouts.${answers.navbar_layout}`)
        : "—",
    },
    {
      key: "hero",
      step: "look.hero",
      value: answers.hero_style
        ? t(`heroStyles.${answers.hero_style}.label`)
        : "—",
    },
    {
      key: "pages",
      step: "pages.home",
      value:
        Object.values(answers.page_layouts ?? {})
          .map((id) => t(`layouts.${id}`))
          .join(" · ") || t("common.recommended"),
    },
    {
      key: "logo",
      step: "logo",
      value:
        answers.logo?.mode === "ai"
          ? t("logo.ai.title")
          : answers.logo?.mode === "curated"
            ? t("logo.curated.title")
            : t("logo.wordmark.title"),
    },
  ];
  return (
    <div>
      <SlideHeader
        heading={t("review.heading")}
        subhead={t("review.subhead")}
      />
      {/* The last thing they see before "create" — every answer they gave,
       * cascading in, so the summary lands as a reveal rather than a form. */}
      <motion.ul
        variants={listVariants}
        initial="hidden"
        animate="show"
        className="mt-5 divide-y divide-foreground/[0.06] rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]"
      >
        {rows.map((row) => (
          <motion.li
            key={row.key}
            variants={itemVariants}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span className="w-24 flex-shrink-0 text-[12px] font-medium text-muted-foreground">
              {t(`review.rows.${row.key}`)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
              {row.value}
            </span>
            <button
              type="button"
              onClick={() => onEdit(row.step)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/70 transition-colors hover:bg-foreground/[0.1]"
              aria-label={t("review.edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}
