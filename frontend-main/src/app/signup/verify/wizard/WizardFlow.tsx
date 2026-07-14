"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { finalizeWizard, getWizardCatalog, patchWizardState, readWizardState } from "@/lib/wizard/api";
import { buildSteps, finishRestAnswers, firstUnansweredStep, nextStep, prevStep, progressPct } from "@/lib/wizard/machine";
import type { WizardAnswers, WizardCatalog, WizardLogoAnswer } from "@/lib/wizard/types";
import { ApiError } from "@/types/api";

import { WizardShell } from "./WizardShell";
import { LivePreview } from "./previews";
import { PageLayoutStep } from "./pages-steps";
import { DescribeStep, FontStep, GoalsStep, HeroStep, NavbarStep, NicheStep, ThemeStep } from "./steps";
import { LogoStep, ReviewStep } from "./logo-review-steps";

function brandFromToken(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.brand_name === "string" ? payload.brand_name : "";
  } catch {
    return "";
  }
}

export function WizardFlow({
  token,
  onProvisioning,
  onTokenExpired,
}: {
  token: string;
  onProvisioning: (slug?: string) => void;
  onTokenExpired: () => void;
}) {
  const t = useTranslations("wizard");
  const searchParams = useSearchParams();
  const initialUpgraded = searchParams.get("upgraded") === "1";
  const brand = useMemo(() => brandFromToken(token), [token]);
  const [catalog, setCatalog] = useState<WizardCatalog | null>(null);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [stepId, setStepId] = useState("business.niche");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllThemes, setShowAllThemes] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    Promise.all([getWizardCatalog(), readWizardState(token)])
      .then(([cat, res]) => {
        if (res.status !== "pending" || ["seeding", "ready", "skipped"].includes(res.template_status)) {
          onProvisioning(res.slug);
          return;
        }
        const loaded = res.state.answers ?? {};
        setCatalog(cat);
        setAnswers(loaded);
        const steps = buildSteps(cat, loaded);
        const wanted = res.state.current_step;
        setStepId(wanted && steps.some((s) => s.id === wanted) ? wanted : firstUnansweredStep(steps, loaded).id);
      })
      .catch((err) => {
        // readWizardState's only 400 is a bad/expired token — the stashed
        // localStorage token can outlive its 7 days.
        if (err instanceof ApiError && err.status === 400) {
          onTokenExpired();
          return;
        }
        setError(t("common.errors.generic"));
      });
  }, [token, onProvisioning, onTokenExpired, t]);

  const steps = useMemo(() => (catalog ? buildSteps(catalog, answers) : []), [catalog, answers]);
  const step = steps.find((s) => s.id === stepId) ?? steps[0];

  const draft = useCallback((partial: WizardAnswers) => setAnswers((a) => ({ ...a, ...partial })), []);

  // The slice Continue commits: the user's pick, or the preselected
  // recommendation they implicitly accepted by continuing.
  const currentSlice = useCallback((): WizardAnswers => {
    if (!catalog || !step) return {};
    const rec = catalog.recommended;
    const ranked = catalog.theme_ranking[answers.niche ?? "general"] ?? catalog.themes;
    switch (step.id) {
      case "business.niche":
        return { niche: answers.niche };
      case "business.describe":
        return { description: answers.description ?? "" };
      case "business.goals":
        return { goals: answers.goals ?? [] };
      case "look.theme":
        return { theme: answers.theme ?? ranked[0] };
      case "look.font":
        return { font_family: answers.font_family ?? rec.font_family };
      case "look.navbar":
        return { navbar_layout: answers.navbar_layout ?? rec.navbar_layout };
      case "look.hero":
        return { hero_style: answers.hero_style ?? rec.hero_style };
      case "logo":
        return { logo: answers.logo ?? ({ mode: "wordmark", curated_id: null } as WizardLogoAnswer) };
      case "review":
        return {};
      default: {
        const page = step.id.replace("pages.", "");
        const current = answers.page_layouts ?? {};
        return { page_layouts: { ...current, [page]: current[page] ?? catalog.page_layouts[page][0].id } };
      }
    }
  }, [answers, catalog, step]);

  const commit = useCallback(
    async (partial: WizardAnswers, goToId: string, extra?: { finished_rest_for_me?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        await patchWizardState(token, { answers: partial, current_step: goToId, ...extra });
        setAnswers((a) => ({ ...a, ...partial }));
        setStepId(goToId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          onProvisioning();
          return;
        }
        setError(t("common.errors.generic"));
      } finally {
        setBusy(false);
      }
    },
    [token, onProvisioning, t],
  );

  // Single-select steps (one option, one outcome) advance the moment the
  // coach picks — no separate "Continue" tap needed. Multi-select
  // (goals) and free-text (describe) steps stay on draft() + Continue.
  const selectAndAdvance = useCallback(
    (partial: WizardAnswers) => {
      if (!step || busy) return;
      const next = nextStep(steps, step.id);
      void commit(partial, next?.id ?? "review");
    },
    [commit, steps, step, busy],
  );

  const handleContinue = async () => {
    if (!catalog || !step || busy) return;
    if (step.id === "review") {
      setBusy(true);
      setError(null);
      try {
        const res = await finalizeWizard(token);
        onProvisioning(res.slug);
      } catch {
        setBusy(false);
        setError(t("common.errors.generic"));
      }
      return;
    }
    const next = nextStep(steps, step.id);
    await commit(currentSlice(), next?.id ?? "review");
  };

  const handleFinishRest = async () => {
    if (!catalog || busy) return;
    await commit(finishRestAnswers(catalog, answers), "logo", { finished_rest_for_me: true });
  };

  const handleBack = () => {
    const prev = step && prevStep(steps, step.id);
    if (prev && !busy) setStepId(prev.id);
  };

  if (!catalog || !step) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        {error ? <p className="text-[14px] text-destructive">{error}</p> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  const goals = answers.goals ?? [];
  const continueDisabled = step.id === "business.niche" && !answers.niche;
  const showPreview = step.chapter !== "business";

  let body: React.ReactNode;
  switch (step.id) {
    case "business.niche":
      body = <NicheStep catalog={catalog} value={answers.niche} onChange={(niche) => selectAndAdvance({ niche })} />;
      break;
    case "business.describe":
      body = <DescribeStep catalog={catalog} value={answers.description} onChange={(description) => draft({ description })} />;
      break;
    case "business.goals":
      body = <GoalsStep catalog={catalog} value={answers.goals} onChange={(g) => draft({ goals: g })} />;
      break;
    case "look.theme":
      body = (
        <ThemeStep
          catalog={catalog}
          niche={answers.niche}
          value={answers.theme ?? (catalog.theme_ranking[answers.niche ?? "general"] ?? catalog.themes)[0]}
          onChange={(theme) => selectAndAdvance({ theme })}
          showAll={showAllThemes}
          onShowAll={() => setShowAllThemes(true)}
        />
      );
      break;
    case "look.font":
      body = <FontStep catalog={catalog} brand={brand} value={answers.font_family ?? catalog.recommended.font_family} onChange={(font_family) => selectAndAdvance({ font_family })} />;
      break;
    case "look.navbar":
      body = <NavbarStep catalog={catalog} brand={brand} theme={answers.theme} font={answers.font_family} value={answers.navbar_layout ?? catalog.recommended.navbar_layout} onChange={(navbar_layout) => selectAndAdvance({ navbar_layout })} />;
      break;
    case "look.hero":
      body = <HeroStep catalog={catalog} brand={brand} theme={answers.theme} font={answers.font_family} value={answers.hero_style ?? catalog.recommended.hero_style} onChange={(hero_style) => selectAndAdvance({ hero_style })} />;
      break;
    case "logo":
      body = (
        <LogoStep
          token={token}
          brand={brand}
          niche={answers.niche}
          theme={answers.theme}
          font={answers.font_family}
          value={answers.logo}
          onChange={(logo) => draft({ logo })}
          initialUpgraded={initialUpgraded}
        />
      );
      break;
    case "review":
      body = <ReviewStep catalog={catalog} answers={answers} onEdit={(id) => setStepId(id)} />;
      break;
    default: {
      const page = step.id.replace("pages.", "");
      body = (
        <PageLayoutStep
          catalog={catalog}
          page={page}
          value={answers.page_layouts?.[page] ?? catalog.page_layouts[page][0].id}
          onChange={(layoutId) =>
            selectAndAdvance({ page_layouts: { ...(answers.page_layouts ?? {}), [page]: layoutId } })
          }
          theme={answers.theme}
          goals={goals}
        />
      );
    }
  }

  return (
    <WizardShell
      chapter={step.chapter}
      progress={progressPct(steps, step.id)}
      canBack={Boolean(prevStep(steps, step.id))}
      onBack={handleBack}
      showFinishRest={step.chapter !== "business" && step.id !== "review"}
      onFinishRest={handleFinishRest}
      error={error}
      aside={showPreview ? <LivePreview answers={answers} brand={brand} /> : undefined}
      footer={
        <Button type="button" variant="brand" size="lg" className="w-full" onClick={handleContinue} disabled={continueDisabled || busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{step.id === "review" ? t("review.creating") : t("common.saving")}</span>
            </>
          ) : step.id === "review" ? (
            t("review.create")
          ) : (
            <>
              {t("common.continue")}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      }
    >
      {body}
    </WizardShell>
  );
}
