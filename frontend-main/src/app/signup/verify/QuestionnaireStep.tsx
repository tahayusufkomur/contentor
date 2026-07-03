"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Brush,
  Check,
  Dumbbell,
  Flame,
  Flower2,
  Loader2,
  Music4,
  ScanFace,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { seedFromTemplate, skipTemplate } from "@/lib/api/onboarding";
import { ApiError } from "@/types/api";

interface NicheOption {
  key: string;
  Icon: LucideIcon;
}

interface GoalOption {
  key: string;
}

// Niche keys must match Python module names under
// backend/apps/core/management/commands/demo_data/.
const NICHE_OPTIONS: NicheOption[] = [
  { key: "yoga", Icon: Flower2 },
  { key: "pilates", Icon: Wind },
  { key: "fitness", Icon: Dumbbell },
  { key: "pole_dance", Icon: Flame },
  { key: "belly_dance", Icon: Music4 },
  { key: "face_yoga", Icon: ScanFace },
  { key: "makeup", Icon: Brush },
];

const GOAL_OPTIONS: GoalOption[] = [
  { key: "sell_courses" },
  { key: "run_live_classes" },
  { key: "in_person_events" },
  { key: "sell_downloads" },
  { key: "email_marketing" },
  { key: "build_community" },
];

const TOTAL_SLIDES = 2;

interface QuestionnaireStepProps {
  token: string;
  onSubmitted: () => void;
}

export function QuestionnaireStep({
  token,
  onSubmitted,
}: QuestionnaireStepProps) {
  const t = useTranslations("auth.signup.questionnaire");
  const [slide, setSlide] = useState(0);
  const [niche, setNiche] = useState<string | null>(null);
  const [goals, setGoals] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"continue" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleGoal = useCallback((key: string) => {
    setGoals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const allGoalsSelected = goals.size === GOAL_OPTIONS.length;
  const toggleAllGoals = useCallback(() => {
    setGoals((prev) =>
      prev.size === GOAL_OPTIONS.length
        ? new Set()
        : new Set(GOAL_OPTIONS.map((o) => o.key)),
    );
  }, []);

  const selectNiche = useCallback((key: string) => {
    setNiche(key);
    // Auto-advance after a beat so the selection state is visible.
    window.setTimeout(() => setSlide(1), 240);
  }, []);

  const handleContinue = async () => {
    if (!niche || busy) return;
    setBusy("continue");
    setError(null);
    try {
      await seedFromTemplate(token, niche, Array.from(goals));
      onSubmitted();
    } catch (err) {
      setBusy(null);
      setError(
        err instanceof ApiError
          ? ((err.data?.detail as string | undefined) ?? t("errors.generic"))
          : t("errors.generic"),
      );
    }
  };

  const handleSkip = async () => {
    if (busy) return;
    setBusy("skip");
    setError(null);
    try {
      await skipTemplate(token);
      onSubmitted();
    } catch (err) {
      setBusy(null);
      setError(
        err instanceof ApiError
          ? ((err.data?.detail as string | undefined) ?? t("errors.generic"))
          : t("errors.generic"),
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background">
      {/* Aurora backdrop — same recipe as AuthShell so the visual carries over */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="aurora animate-aurora" />
        <div className="grid-fade absolute inset-0 opacity-40" />
      </div>

      <div className="mx-auto flex h-full max-w-[440px] flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        {/* Header — back/skip + progress */}
        <header className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => slide > 0 && setSlide(slide - 1)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
              slide === 0
                ? "pointer-events-none opacity-0"
                : "bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/[0.1]"
            }`}
            aria-label={t("back")}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>

          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                  i === slide ? "w-7 bg-foreground" : "w-1.5 bg-foreground/25"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleSkip}
            disabled={busy !== null}
            className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            {busy === "skip" ? t("skipping") : t("skipShort")}
          </button>
        </header>

        {/* Slide track — fills available vertical space */}
        <div className="relative mt-6 flex-1 overflow-hidden">
          <div
            className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(-${slide * 100}%)` }}
          >
            {/* Slide 1 — Niche */}
            <div className="flex h-full w-full flex-shrink-0 flex-col">
              <SlideHeader
                heading={t("nicheHeading")}
                subhead={t("nicheSubhead")}
                active={slide === 0}
              />
              <div className="mt-5 grid flex-1 grid-cols-2 content-start gap-2.5">
                {NICHE_OPTIONS.map((opt, idx) => (
                  <NicheTile
                    key={opt.key}
                    opt={opt}
                    selected={opt.key === niche}
                    label={t(`niches.${opt.key}.label`)}
                    tagline={t(`niches.${opt.key}.tagline`)}
                    onSelect={selectNiche}
                    delayMs={slide === 0 ? idx * 38 : 0}
                    active={slide === 0}
                  />
                ))}
              </div>
            </div>

            {/* Slide 2 — Goals */}
            <div className="flex h-full w-full flex-shrink-0 flex-col">
              <SlideHeader
                heading={t("goalsHeading")}
                subhead={t("goalsSubhead")}
                active={slide === 1}
              />
              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={toggleAllGoals}
                  className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {allGoalsSelected ? t("deselectAll") : t("selectAll")}
                </button>
              </div>
              <div className="mt-2 flex flex-1 flex-col gap-2">
                {GOAL_OPTIONS.map((opt, idx) => (
                  <GoalRow
                    key={opt.key}
                    label={t(`goals.${opt.key}`)}
                    checked={goals.has(opt.key)}
                    onToggle={() => toggleGoal(opt.key)}
                    delayMs={slide === 1 ? idx * 42 : 0}
                    active={slide === 1}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-2 text-center text-[12.5px] text-destructive">
            {error}
          </p>
        )}

        {/* Footer CTA — pinned to the bottom of the viewport */}
        <footer className="mt-4 space-y-2">
          {slide === 0 ? (
            <Button
              type="button"
              variant="brand"
              size="lg"
              className="w-full"
              onClick={() => niche && setSlide(1)}
              disabled={!niche}
            >
              {t("next")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="brand"
              size="lg"
              className="w-full"
              onClick={handleContinue}
              disabled={!niche || busy !== null}
            >
              {busy === "continue" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("continuing")}</span>
                </>
              ) : (
                t("continue")
              )}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SlideHeader({
  heading,
  subhead,
  active,
}: {
  heading: string;
  subhead: string;
  active: boolean;
}) {
  return (
    <div
      className={`flex-shrink-0 transition-all duration-500 ease-out ${
        active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-70"
      }`}
    >
      <h2 className="text-display text-[24px] leading-tight tracking-[-0.02em] md:text-[26px]">
        {heading}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        {subhead}
      </p>
    </div>
  );
}

function NicheTile({
  opt,
  selected,
  label,
  tagline,
  onSelect,
  delayMs,
  active,
}: {
  opt: NicheOption;
  selected: boolean;
  label: string;
  tagline: string;
  onSelect: (key: string) => void;
  delayMs: number;
  active: boolean;
}) {
  const { Icon, key } = opt;
  return (
    <button
      type="button"
      onClick={() => onSelect(key)}
      style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
      className={`group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl border p-3 text-left transition-all duration-500 ease-out active:scale-[0.98] ${
        active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${
        selected
          ? "border-primary bg-primary/[0.06]"
          : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]"
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-300 ${
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-foreground/[0.06] text-foreground/70 group-hover:bg-foreground/[0.1] group-hover:text-foreground"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>

      <div className="mt-2.5 w-full">
        <p className="text-[13px] font-semibold leading-tight tracking-tight">
          {label}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {tagline}
        </p>
      </div>

      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function GoalRow({
  label,
  checked,
  onToggle,
  delayMs,
  active,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  delayMs: number;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-500 ease-out active:scale-[0.99] ${
        active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${
        checked
          ? "border-primary bg-primary/[0.06]"
          : "border-foreground/[0.08] bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04]"
      }`}
    >
      <span
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-foreground/30 bg-transparent"
        }`}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="text-[14.5px] font-medium tracking-tight">{label}</span>
    </button>
  );
}
