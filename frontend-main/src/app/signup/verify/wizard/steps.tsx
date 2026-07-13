"use client";

import { Brush, Check, Dumbbell, Flame, Flower2, Music4, ScanFace, Sparkles, Wind, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { FONT_STACKS, THEME_SWATCHES } from "@/lib/wizard/wizard-themes";
import type { WizardCatalog } from "@/lib/wizard/types";

import { MiniHero, MiniNavbar } from "./previews";

// Keys must match Python modules under backend demo_data/ (same list the
// old QuestionnaireStep used).
const NICHE_ICONS: Record<string, LucideIcon> = {
  yoga: Flower2, pilates: Wind, fitness: Dumbbell, pole_dance: Flame,
  belly_dance: Music4, face_yoga: ScanFace, makeup: Brush, general: Sparkles,
};

export function SlideHeader({ heading, subhead }: { heading: string; subhead: string }) {
  return (
    <div className="flex-shrink-0">
      <h2 className="text-display text-[24px] leading-tight tracking-[-0.02em] md:text-[26px]">{heading}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{subhead}</p>
    </div>
  );
}

export function OptionCard({
  selected, onSelect, title, subtitle, badge, children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex w-full flex-col gap-2 rounded-2xl border p-3 text-left transition-all active:scale-[0.99] ${
        selected
          ? "border-primary bg-primary/[0.06]"
          : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]"
      }`}
    >
      {children}
      <span className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-semibold tracking-tight">{title}</span>
        {subtitle && <span className="text-[11.5px] text-muted-foreground">{subtitle}</span>}
        {badge && (
          <span className="ml-auto rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{badge}</span>
        )}
      </span>
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export function NicheStep({ catalog, value, onChange }: { catalog: WizardCatalog; value?: string; onChange: (niche: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("niche.heading")} subhead={t("niche.subhead")} />
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {catalog.niches.map((key) => {
          const Icon = NICHE_ICONS[key] ?? Sparkles;
          return (
            <OptionCard key={key} selected={value === key} onSelect={() => onChange(key)} title={t(`niches.${key}.label`)} subtitle={t(`niches.${key}.tagline`)}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${value === key ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-foreground/70"}`}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
            </OptionCard>
          );
        })}
      </div>
    </div>
  );
}

export function DescribeStep({ catalog, value, onChange }: { catalog: WizardCatalog; value?: string; onChange: (text: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("describe.heading")} subhead={t("describe.subhead")} />
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.slice(0, catalog.description_max_len))}
        placeholder={t("describe.placeholder")}
        rows={5}
        className="mt-5 w-full resize-none rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 text-[14px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">{(value ?? "").length}/{catalog.description_max_len}</p>
    </div>
  );
}

export function GoalsStep({ catalog, value, onChange }: { catalog: WizardCatalog; value?: string[]; onChange: (goals: string[]) => void }) {
  const t = useTranslations("wizard");
  const goals = value ?? [];
  const toggle = (key: string) =>
    onChange(goals.includes(key) ? goals.filter((g) => g !== key) : [...goals, key]);
  return (
    <div>
      <SlideHeader heading={t("goals.heading")} subhead={t("goals.subhead")} />
      <div className="mt-5 flex flex-col gap-2">
        {catalog.goals.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.99] ${
              goals.includes(key)
                ? "border-primary bg-primary/[0.06]"
                : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]"
            }`}
          >
            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${goals.includes(key) ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"}`}>
              {goals.includes(key) && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="text-[14.5px] font-medium tracking-tight">{t(`goals.items.${key}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeStep({ catalog, niche, value, onChange, showAll, onShowAll }: { catalog: WizardCatalog; niche?: string; value?: string; onChange: (theme: string) => void; showAll: boolean; onShowAll: () => void }) {
  const t = useTranslations("wizard");
  const ranked = catalog.theme_ranking[niche ?? "general"] ?? catalog.themes;
  const shown = showAll ? [...ranked, ...catalog.themes.filter((x) => !ranked.includes(x))] : ranked;
  return (
    <div>
      <SlideHeader heading={t("theme.heading")} subhead={t("theme.subhead")} />
      <div className="mt-5 flex flex-col gap-2.5">
        {shown.map((theme, i) => {
          const s = THEME_SWATCHES[theme];
          return (
            <OptionCard key={theme} selected={value === theme} onSelect={() => onChange(theme)} title={t(`themes.${theme}`)} badge={i === 0 && !showAll ? t("common.recommended") : undefined}>
              <span className="flex gap-1.5" aria-hidden>
                {[s.primary, s.ink, s.soft].map((c) => (
                  <span key={c} className="h-6 w-10 rounded-md border border-black/5" style={{ background: c }} />
                ))}
              </span>
            </OptionCard>
          );
        })}
      </div>
      {!showAll && (
        <button type="button" onClick={onShowAll} className="mt-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
          {t("common.showAll")}
        </button>
      )}
    </div>
  );
}

export function FontStep({ catalog, brand, value, onChange }: { catalog: WizardCatalog; brand: string; value?: string; onChange: (family: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("font.heading")} subhead={t("font.subhead")} />
      <div className="mt-5 flex flex-col gap-2.5">
        {Object.entries(catalog.fonts).map(([id, family]) => (
          <OptionCard key={id} selected={value === family} onSelect={() => onChange(family)} title={t(`fonts.${id}.label`)} subtitle={t(`fonts.${id}.vibe`)}>
            <span className="text-[22px] leading-snug" style={{ fontFamily: FONT_STACKS[family] ?? family }}>{brand}</span>
          </OptionCard>
        ))}
      </div>
    </div>
  );
}

export function NavbarStep({ catalog, brand, theme, font, value, onChange }: { catalog: WizardCatalog; brand: string; theme?: string; font?: string; value?: string; onChange: (layout: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("navbar.heading")} subhead={t("navbar.subhead")} />
      <div className="mt-5 flex flex-col gap-2.5">
        {catalog.navbar_layouts.map((layout) => (
          <OptionCard key={layout} selected={value === layout} onSelect={() => onChange(layout)} title={t(`navbarLayouts.${layout}`)}>
            <MiniNavbar layout={layout} theme={theme} font={font} brand={brand} />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}

export function HeroStep({ catalog, brand, theme, font, value, onChange }: { catalog: WizardCatalog; brand: string; theme?: string; font?: string; value?: string; onChange: (style: string) => void }) {
  const t = useTranslations("wizard");
  return (
    <div>
      <SlideHeader heading={t("hero.heading")} subhead={t("hero.subhead")} />
      <div className="mt-5 flex flex-col gap-2.5">
        {catalog.hero_styles.map((style) => (
          <OptionCard key={style} selected={value === style} onSelect={() => onChange(style)} title={t(`heroStyles.${style}.label`)} subtitle={t(`heroStyles.${style}.desc`)}>
            <MiniHero style={style} theme={theme} font={font} brand={brand} />
          </OptionCard>
        ))}
      </div>
    </div>
  );
}
