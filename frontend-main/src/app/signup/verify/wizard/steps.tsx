"use client";

import { motion, type Variants } from "framer-motion";
import {
  Brush,
  Check,
  Dumbbell,
  Flame,
  Flower2,
  Music4,
  ScanFace,
  Sparkles,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { FONT_STACKS, THEME_SWATCHES } from "@/lib/wizard/wizard-themes";
import type { DescriptionFollowups, WizardCatalog } from "@/lib/wizard/types";

import { MiniHero, MiniNavbar, ScreenshotThumbnail } from "./previews";

// Keys must match Python modules under backend demo_data/ (same list the
// old QuestionnaireStep used).
const NICHE_ICONS: Record<string, LucideIcon> = {
  yoga: Flower2,
  pilates: Wind,
  fitness: Dumbbell,
  pole_dance: Flame,
  belly_dance: Music4,
  face_yoga: ScanFace,
  makeup: Brush,
  general: Sparkles,
};

/** Options cascade in rather than appearing all at once — the step's content
 * lands after the slide-in, which reads as the page building itself. */
export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 34 },
  },
};

export function OptionList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={listVariants}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SlideHeader({
  heading,
  subhead,
}: {
  heading: string;
  subhead: string;
}) {
  return (
    <div className="flex-shrink-0 text-center">
      <h2 className="text-display text-[24px] leading-tight tracking-[-0.02em] md:text-[26px]">
        {heading}
      </h2>
      <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted-foreground">
        {subhead}
      </p>
    </div>
  );
}

export function OptionCard({
  selected,
  onSelect,
  title,
  subtitle,
  badge,
  disabled,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
  badge?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      // Auto-advance steps save-then-advance; while that save is in flight
      // the step is still on screen, and an enabled card would swallow the
      // click in WizardFlow's busy guard with zero feedback. Same idiom as
      // the Continue button's disabled={busy}.
      disabled={disabled}
      variants={itemVariants}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      // No text-center here: the preview children (MiniHero/MiniNavbar) render
      // real layouts, and inheriting centering would make a left-aligned
      // layout like "Split" preview as centered — misrepresenting the choice.
      // items-center centers the previews themselves; the label centers below.
      // The dim targets descendants, not the button: the entrance animation
      // (itemVariants) leaves an inline opacity:1 on the button itself that
      // would override a plain disabled:opacity-*.
      className={`relative flex w-full flex-col items-center gap-2.5 rounded-2xl border p-3 transition-colors disabled:pointer-events-none [&:disabled>*]:opacity-50 ${
        selected
          ? "border-primary bg-primary/[0.06]"
          : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]"
      }`}
    >
      {children}
      <span className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-[13.5px] font-semibold tracking-tight">
          {title}
        </span>
        {subtitle && (
          <span className="text-[11.5px] leading-snug text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {badge && (
        <span className="absolute left-2 top-2 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {badge}
        </span>
      )}
      {selected && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 22 }}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </motion.span>
      )}
    </motion.button>
  );
}

export function NicheStep({
  catalog,
  value,
  onChange,
  disabled,
}: {
  catalog: WizardCatalog;
  value?: string;
  onChange: (niche: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("niche.heading")} subhead={t("niche.subhead")} />
      <OptionList className="mt-5 grid grid-cols-2 gap-2.5">
        {catalog.niches.map((key) => {
          const Icon = NICHE_ICONS[key] ?? Sparkles;
          return (
            <OptionCard
              key={key}
              selected={value === key}
              onSelect={() => onChange(key)}
              title={t(`niches.${key}.label`)}
              subtitle={t(`niches.${key}.tagline`)}
              disabled={disabled}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${value === key ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-foreground/70"}`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
            </OptionCard>
          );
        })}
      </OptionList>
    </div>
  );
}

export function DescribeStep({
  catalog,
  value,
  onChange,
}: {
  catalog: WizardCatalog;
  value?: string;
  onChange: (text: string) => void;
}) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader
        heading={t("describe.heading")}
        subhead={t("describe.subhead")}
      />
      <textarea
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value.slice(0, catalog.description_max_len))
        }
        placeholder={t("describe.placeholder")}
        rows={5}
        className="mt-5 w-full resize-none rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 text-[14px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        {(value ?? "").length}/{catalog.description_max_len}
      </p>
    </div>
  );
}

export function FollowupsStep({
  value,
  onChange,
}: {
  value?: DescriptionFollowups;
  onChange: (v: DescriptionFollowups) => void;
}) {
  const t = useTranslations("wizard");
  const items = value?.items ?? [];
  const setAnswer = (index: number, a: string) => {
    if (!value) return;
    onChange({
      ...value,
      items: items.map((item, i) =>
        i === index ? { ...item, a: a.slice(0, 500) } : item,
      ),
    });
  };
  return (
    <div>
      <SlideHeader
        heading={t("followups.heading")}
        subhead={t("followups.subhead")}
      />
      <OptionList className="mt-5 flex flex-col gap-4">
        {items.map((item, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            className="flex flex-col gap-2"
          >
            <label
              className="text-[14px] font-medium tracking-tight"
              htmlFor={`followup-${i}`}
            >
              {item.q}
            </label>
            <textarea
              id={`followup-${i}`}
              value={item.a}
              onChange={(e) => setAnswer(i, e.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 text-[14px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
            />
          </motion.div>
        ))}
      </OptionList>
    </div>
  );
}

export function GoalsStep({
  catalog,
  value,
  onChange,
}: {
  catalog: WizardCatalog;
  value?: string[];
  onChange: (goals: string[]) => void;
}) {
  const t = useTranslations("wizard");
  const goals = value ?? [];
  const toggle = (key: string) =>
    onChange(
      goals.includes(key) ? goals.filter((g) => g !== key) : [...goals, key],
    );
  const allSelected =
    catalog.goals.length > 0 &&
    catalog.goals.every((key) => goals.includes(key));
  return (
    <div>
      <SlideHeader heading={t("goals.heading")} subhead={t("goals.subhead")} />
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : [...catalog.goals])}
          className="text-[12.5px] font-medium text-primary hover:underline"
        >
          {allSelected ? t("goals.clearAll") : t("goals.selectAll")}
        </button>
      </div>
      {/* Rows stay left-aligned: a checkbox reads as a checkbox only when the
       * boxes line up in a column the eye can run down. */}
      <OptionList className="mt-4 flex flex-col gap-2">
        {catalog.goals.map((key) => (
          <motion.button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            variants={itemVariants}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
              goals.includes(key)
                ? "border-primary bg-primary/[0.06]"
                : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]"
            }`}
          >
            <span
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${goals.includes(key) ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"}`}
            >
              {goals.includes(key) && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 600, damping: 22 }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </motion.span>
              )}
            </span>
            <span className="text-[14.5px] font-medium tracking-tight">
              {t(`goals.items.${key}`)}
            </span>
          </motion.button>
        ))}
      </OptionList>
    </div>
  );
}

export function ThemeStep({
  catalog,
  niche,
  value,
  onChange,
  showAll,
  onShowAll,
  disabled,
}: {
  catalog: WizardCatalog;
  niche?: string;
  value?: string;
  onChange: (theme: string) => void;
  showAll: boolean;
  onShowAll: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("wizard");
  const ranked = catalog.theme_ranking[niche ?? "general"] ?? catalog.themes;
  const shown = showAll
    ? [...ranked, ...catalog.themes.filter((x) => !ranked.includes(x))]
    : ranked;
  return (
    <div>
      <SlideHeader heading={t("theme.heading")} subhead={t("theme.subhead")} />
      <OptionList className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {shown.map((theme, i) => {
          const s = THEME_SWATCHES[theme];
          return (
            <OptionCard
              key={theme}
              selected={value === theme}
              onSelect={() => onChange(theme)}
              title={t(`themes.${theme}`)}
              badge={i === 0 && !showAll ? t("common.recommended") : undefined}
              disabled={disabled}
            >
              <div className="flex w-full flex-col items-center gap-2">
                <ScreenshotThumbnail
                  src={`/wizard-mockups/theme-${theme}.png`}
                  fallback={null}
                />
                <span className="flex gap-1.5" aria-hidden>
                  {[s.primary, s.ink, s.soft].map((c) => (
                    <span
                      key={c}
                      className="h-5 w-9 rounded-md border border-black/5"
                      style={{ background: c }}
                    />
                  ))}
                </span>
              </div>
            </OptionCard>
          );
        })}
      </OptionList>
      {!showAll && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={onShowAll}
            className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            {t("common.showAll")}
          </button>
        </div>
      )}
    </div>
  );
}

export function FontStep({
  catalog,
  brand,
  value,
  onChange,
  disabled,
}: {
  catalog: WizardCatalog;
  brand: string;
  value?: string;
  onChange: (family: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("font.heading")} subhead={t("font.subhead")} />
      <OptionList className="mt-5 flex flex-col gap-2.5">
        {Object.entries(catalog.fonts).map(([id, family]) => (
          <OptionCard
            key={id}
            selected={value === family}
            onSelect={() => onChange(family)}
            title={t(`fonts.${id}.label`)}
            subtitle={t(`fonts.${id}.vibe`)}
            disabled={disabled}
          >
            <span
              className="text-[22px] leading-snug"
              style={{ fontFamily: FONT_STACKS[family] ?? family }}
            >
              {brand}
            </span>
          </OptionCard>
        ))}
      </OptionList>
    </div>
  );
}

export function NavbarStep({
  catalog,
  brand,
  theme,
  font,
  value,
  onChange,
  disabled,
}: {
  catalog: WizardCatalog;
  brand: string;
  theme?: string;
  font?: string;
  value?: string;
  onChange: (layout: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader
        heading={t("navbar.heading")}
        subhead={t("navbar.subhead")}
      />
      <OptionList className="mt-5 flex flex-col gap-2.5">
        {catalog.navbar_layouts.map((layout) => (
          <OptionCard
            key={layout}
            selected={value === layout}
            onSelect={() => onChange(layout)}
            title={t(`navbarLayouts.${layout}`)}
            disabled={disabled}
          >
            <MiniNavbar
              layout={layout}
              theme={theme}
              font={font}
              brand={brand}
            />
          </OptionCard>
        ))}
      </OptionList>
    </div>
  );
}

export function HeroStep({
  catalog,
  brand,
  theme,
  font,
  value,
  onChange,
  disabled,
}: {
  catalog: WizardCatalog;
  brand: string;
  theme?: string;
  font?: string;
  value?: string;
  onChange: (style: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("hero.heading")} subhead={t("hero.subhead")} />
      <OptionList className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {catalog.hero_styles.map((style) => (
          <OptionCard
            key={style}
            selected={value === style}
            onSelect={() => onChange(style)}
            title={t(`heroStyles.${style}.label`)}
            subtitle={t(`heroStyles.${style}.desc`)}
            disabled={disabled}
          >
            <ScreenshotThumbnail
              src={`/wizard-mockups/hero-${style}.png`}
              fallback={
                <MiniHero
                  style={style}
                  theme={theme}
                  font={font}
                  brand={brand}
                />
              }
            />
          </OptionCard>
        ))}
      </OptionList>
    </div>
  );
}
