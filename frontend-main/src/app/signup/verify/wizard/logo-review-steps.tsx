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
import { Skeleton } from "@shared/ui/skeleton";
import { Spinner } from "@shared/ui/spinner";
import { StaleContainer } from "@shared/ui/stale-container";

import { getCuratedLogos, readWizardState } from "@/lib/wizard/api";
import type {
  CuratedLogoItem,
  CuratedLogoLayout,
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

/** Curated marks shown per page in the wizard's Ready-made grid. */
const PAGE_SIZE = 12;

/** Lockups a curated mark can be paired with. `name_only` is deliberately
 * absent: hiding the mark you just picked is what the Wordmark door already
 * does, so offering it here would be a second route to the same result. */
const CURATED_LAYOUTS = ["horizontal", "stacked"] as const;

/** Mark + brand name in the coach's chosen arrangement. Shared by the gallery
 * cards and the lockup picker so both previews can never drift apart, and it
 * mirrors the public header's Brand component (which reads the same
 * navbar_config.logo_layout the wizard persists). */
function LogoLockup({
  imageUrl,
  alt,
  brand,
  layout,
  ink,
  fontStack,
  size = "sm",
}: {
  imageUrl: string;
  alt: string;
  brand: string;
  layout: CuratedLogoLayout;
  ink: string;
  fontStack: string;
  size?: "sm" | "lg";
}) {
  const stacked = layout === "stacked";
  const img = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const text = size === "lg" ? "text-[14px]" : "text-[12px]";
  return (
    <span
      className={`flex rounded-lg bg-white p-2 ${
        stacked ? "flex-col items-center gap-1" : "items-center gap-2"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL */}
      <img src={imageUrl} alt={alt} className={`${img} object-contain`} />
      <span
        className={`max-w-full truncate font-semibold ${text}`}
        style={{ color: ink, fontFamily: fontStack }}
      >
        {brand}
      </span>
    </span>
  );
}

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
  // Distinguishes "still fetching" from "fetch failed" from "gallery is
  // genuinely empty" — all three used to look identical (an absent section),
  // so a fast-moving coach never learned the gallery existed.
  const [galleryState, setGalleryState] = useState<
    "loading" | "ready" | "failed"
  >("loading");
  useEffect(() => {
    getCuratedLogos()
      .then((res) => {
        setItems(res);
        setGalleryState("ready");
      })
      .catch(() => {
        setItems([]);
        setGalleryState("failed");
      });
  }, []);

  // Server-side AI rank computed while the coach walked the look/pages
  // chapters; absent (task still running / AI off) -> keyword rank only.
  // Tracked separately from the value because it REORDERS an already-visible
  // grid: the coach needs a "still improving" signal, not a blank.
  const [aiRank, setAiRank] = useState<number[] | undefined>(undefined);
  const [rankPending, setRankPending] = useState(true);
  useEffect(() => {
    let cancelled = false;
    readWizardState(token)
      .then((res) => {
        if (cancelled) return;
        setAiRank(res.state.curated_logo_rank);
      })
      .catch(() => {
        if (cancelled) return;
        setAiRank(undefined);
      })
      .finally(() => {
        if (!cancelled) setRankPending(false);
      });
    return () => {
      cancelled = true;
    };
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

  // "Show more" pages deeper into the SAME ranked list rather than
  // reshuffling: with ~780 marks there is a long tail of still-relevant
  // options, and randomising would throw away the niche ranking that put
  // the good matches on page 1.
  const [page, setPage] = useState(0);
  // A new rank arriving (or the coach changing niche upstream) re-sorts the
  // list under the current page, so page 2 would no longer mean what it did.
  useEffect(() => setPage(0), [ranked.length, aiRank]);

  const visible = useMemo(() => {
    const slice = ranked.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    // Keep the coach's pick on screen after paging away from it — a selection
    // that scrolls out of view reads as though the app dropped the choice.
    if (mode !== "curated" || value?.curated_id == null) return slice;
    if (slice.some((item) => item.id === value.curated_id)) return slice;
    const picked = ranked.find((item) => item.id === value.curated_id);
    return picked ? [picked, ...slice.slice(0, PAGE_SIZE - 1)] : slice;
  }, [ranked, page, mode, value?.curated_id]);

  const hasMore = (page + 1) * PAGE_SIZE < ranked.length;

  const selectedItem =
    mode === "curated" && value?.curated_id != null
      ? ranked.find((item) => item.id === value.curated_id)
      : undefined;

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

        {/* Rendered unless the gallery is known-empty: the heading claims its
         * space up front so arriving logos don't shove the AI door down the
         * page, and so the coach knows a gallery is coming. */}
        {galleryState !== "ready" || ranked.length > 0 ? (
          <div>
            <p
              // The label swaps as each load lands (loading -> ranking ->
              // settled), so announce it politely rather than silently.
              aria-live="polite"
              className="mb-2 mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground"
            >
              {galleryState === "failed" ? (
                t("logo.curated.failed")
              ) : (
                <>
                  {t("logo.curated.title")} —{" "}
                  {galleryState === "loading"
                    ? t("logo.curated.loading")
                    : rankPending
                      ? t("logo.curated.ranking")
                      : t("logo.curated.desc")}
                  {/* Decorative: the adjacent text already states the status,
                   * so an sr-only label here would announce it twice. The
                   * aria-live below is what actually narrates the change. */}
                  {(galleryState === "loading" || rankPending) && (
                    <Spinner size="sm" label="" aria-hidden="true" />
                  )}
                </>
              )}
            </p>
            {galleryState === "loading" ? (
              // First load: skeleton grid at the real card size, so the 12
              // marks land in place instead of reflowing the step.
              <div className="grid grid-cols-2 gap-2.5" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[104px] rounded-2xl" />
                ))}
              </div>
            ) : (
              // Re-rank is a refinement load: cards dim and go inert, never
              // blank, so a half-made choice stays on screen.
              <StaleContainer pending={rankPending} showLine={false}>
                <div className="grid grid-cols-2 gap-2.5">
                  {visible.map((item) => (
                    <OptionCard
                      key={item.id}
                      selected={
                        mode === "curated" && value?.curated_id === item.id
                      }
                      onSelect={() =>
                        onChange({
                          mode: "curated",
                          curated_id: item.id,
                          // Keep the coach's lockup choice when they switch
                          // marks; default only on a first pick.
                          layout: value?.layout ?? "horizontal",
                        })
                      }
                      title={item.title}
                    >
                      <LogoLockup
                        imageUrl={item.image_url}
                        alt={item.title}
                        brand={brand}
                        layout={value?.layout ?? "horizontal"}
                        ink={s.ink}
                        fontStack={stack}
                      />
                    </OptionCard>
                  ))}
                </div>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="mt-2.5 w-full rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] hover:text-foreground"
                  >
                    {t("logo.curated.showMore")}
                  </button>
                )}

                {/* Only meaningful once a mark is chosen — there is nothing to
                 * arrange until then, so it stays out of the way. */}
                {mode === "curated" && selectedItem && (
                  <div className="mt-3">
                    <p className="mb-2 text-[12.5px] font-semibold text-muted-foreground">
                      {t("logo.curated.layout.title")}
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {CURATED_LAYOUTS.map((id) => (
                        <OptionCard
                          key={id}
                          selected={(value?.layout ?? "horizontal") === id}
                          onSelect={() =>
                            onChange({
                              mode: "curated",
                              curated_id: selectedItem.id,
                              layout: id,
                            })
                          }
                          title={t(`logo.curated.layout.${id}`)}
                        >
                          <LogoLockup
                            imageUrl={selectedItem.image_url}
                            alt={selectedItem.title}
                            brand={brand}
                            layout={id}
                            ink={s.ink}
                            fontStack={stack}
                            size="lg"
                          />
                        </OptionCard>
                      ))}
                    </div>
                  </div>
                )}
              </StaleContainer>
            )}
          </div>
        ) : null}

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
