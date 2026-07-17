"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  finalizeWizard,
  getDescribeFollowups,
  getWizardCatalog,
  patchWizardState,
  readWizardState,
} from "@/lib/wizard/api";
import {
  buildSteps,
  finishRestAnswers,
  firstUnansweredStep,
  nextStep,
  prevStep,
  progressPct,
} from "@/lib/wizard/machine";
import type {
  WizardAnswers,
  WizardCatalog,
  WizardLogoAnswer,
} from "@/lib/wizard/types";
import { ApiError } from "@/types/api";

import { WizardShell } from "./WizardShell";
import { PageLayoutStep } from "./pages-steps";
import {
  DescribeStep,
  FollowupsStep,
  FontStep,
  GoalsStep,
  HeroStep,
  NavbarStep,
  NicheStep,
  ThemeStep,
} from "./steps";
import { LogoStep, ReviewStep } from "./logo-review-steps";

function brandFromToken(token: string): string {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
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
  // Stripe substitutes {CHECKOUT_SESSION_ID} into the success URL; the AI
  // door posts it to checkout/sync/ so payment lands without a webhook.
  const checkoutSessionId = searchParams.get("session_id") ?? undefined;
  const brand = useMemo(() => brandFromToken(token), [token]);
  const [catalog, setCatalog] = useState<WizardCatalog | null>(null);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [stepId, setStepId] = useState("business.niche");
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back; drives the slide
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllThemes, setShowAllThemes] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    Promise.all([getWizardCatalog(), readWizardState(token)])
      .then(([cat, res]) => {
        if (
          res.status !== "pending" ||
          ["seeding", "ready", "skipped"].includes(res.template_status)
        ) {
          onProvisioning(res.slug);
          return;
        }
        const loaded = res.state.answers ?? {};
        setCatalog(cat);
        setAnswers(loaded);
        const steps = buildSteps(cat, loaded);
        const wanted = res.state.current_step;
        setStepId(
          wanted && steps.some((s) => s.id === wanted)
            ? wanted
            : firstUnansweredStep(steps, loaded).id,
        );
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

  const steps = useMemo(
    () => (catalog ? buildSteps(catalog, answers) : []),
    [catalog, answers],
  );
  const step = steps.find((s) => s.id === stepId) ?? steps[0];

  const draft = useCallback(
    (partial: WizardAnswers) => setAnswers((a) => ({ ...a, ...partial })),
    [],
  );

  // The slice Continue commits. Only the steps that still HAVE a Continue
  // button appear here: single-select steps advance on the pick itself
  // (selectAndAdvance), so they never route through this.
  const currentSlice = useCallback((): WizardAnswers => {
    switch (step?.id) {
      case "business.describe":
        return { description: answers.description ?? "" };
      case "business.followups":
        return answers.description_followups
          ? { description_followups: answers.description_followups }
          : {};
      case "business.goals":
        return { goals: answers.goals ?? [] };
      case "logo":
        return {
          logo:
            answers.logo ??
            ({ mode: "wordmark", curated_id: null } as WizardLogoAnswer),
        };
      default:
        return {};
    }
  }, [answers, step]);

  const commit = useCallback(
    async (
      partial: WizardAnswers,
      goToId: string,
      extra?: { finished_rest_for_me?: boolean },
    ) => {
      setBusy(true);
      setError(null);
      try {
        await patchWizardState(token, {
          answers: partial,
          current_step: goToId,
          ...extra,
        });
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
  // coach picks — they render no Continue button at all, so the pick is the
  // only way forward and nothing sits pre-checked pretending to be chosen.
  // Multi-select (goals) and free-text (describe) steps keep draft() +
  // Continue, since there's no single click that means "done".
  const selectAndAdvance = useCallback(
    (partial: WizardAnswers) => {
      if (!step || busy) return;
      const next = nextStep(steps, step.id);
      setDirection(1);
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
    if (step.id === "business.describe") {
      const description = answers.description ?? "";
      const stored = answers.description_followups;
      let followups =
        stored && stored.for === description && stored.items.length > 0
          ? stored
          : undefined;
      if (!followups && description.trim()) {
        setBusy(true);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20_000);
          const res = await getDescribeFollowups(
            token,
            description,
            controller.signal,
          );
          clearTimeout(timer);
          if (res.questions.length > 0) {
            followups = {
              for: description,
              items: res.questions.map((q) => ({ q, a: "" })),
            };
          }
        } catch {
          // AI unavailable or slow — continue without follow-ups.
        } finally {
          setBusy(false);
        }
      }
      const partial: WizardAnswers = {
        description,
        // Clear stale questions when the description changed and no new ones
        // came back, so the step disappears instead of showing old questions.
        description_followups: followups ?? { for: description, items: [] },
      };
      setDirection(1);
      await commit(
        partial,
        followups ? "business.followups" : "business.goals",
      );
      return;
    }
    const next = nextStep(steps, step.id);
    setDirection(1);
    await commit(currentSlice(), next?.id ?? "review");
  };

  const handleFinishRest = async () => {
    if (!catalog || busy) return;
    setDirection(1);
    await commit(finishRestAnswers(catalog, answers), "logo", {
      finished_rest_for_me: true,
    });
  };

  const handleBack = () => {
    const prev = step && prevStep(steps, step.id);
    if (prev && !busy) {
      setDirection(-1);
      setStepId(prev.id);
    }
  };

  if (!catalog || !step) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        {error ? (
          <p className="text-[14px] text-destructive">{error}</p>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  const goals = answers.goals ?? [];
  // Steps whose pick IS the advance render no Continue button. Nothing on
  // them is pre-checked either — a checked card with no way forward reads as
  // a dead end. "Finish the rest for me" stays the bulk-accept escape hatch,
  // and finalize still fills any never-answered key with the recommendation.
  const autoAdvance =
    step.chapter === "look" ||
    step.chapter === "pages" ||
    step.id === "business.niche";

  let body: React.ReactNode;
  switch (step.id) {
    case "business.niche":
      body = (
        <NicheStep
          catalog={catalog}
          value={answers.niche}
          onChange={(niche) => selectAndAdvance({ niche })}
        />
      );
      break;
    case "business.describe":
      body = (
        <DescribeStep
          catalog={catalog}
          value={answers.description}
          onChange={(description) => draft({ description })}
        />
      );
      break;
    case "business.followups":
      body = (
        <FollowupsStep
          value={answers.description_followups}
          onChange={(description_followups) => draft({ description_followups })}
        />
      );
      break;
    case "business.goals":
      body = (
        <GoalsStep
          catalog={catalog}
          value={answers.goals}
          onChange={(g) => draft({ goals: g })}
        />
      );
      break;
    case "look.theme":
      body = (
        <ThemeStep
          catalog={catalog}
          niche={answers.niche}
          value={answers.theme}
          onChange={(theme) => selectAndAdvance({ theme })}
          showAll={showAllThemes}
          onShowAll={() => setShowAllThemes(true)}
        />
      );
      break;
    case "look.font":
      body = (
        <FontStep
          catalog={catalog}
          brand={brand}
          value={answers.font_family}
          onChange={(font_family) => selectAndAdvance({ font_family })}
        />
      );
      break;
    case "look.navbar":
      body = (
        <NavbarStep
          catalog={catalog}
          brand={brand}
          theme={answers.theme}
          font={answers.font_family}
          value={answers.navbar_layout}
          onChange={(navbar_layout) => selectAndAdvance({ navbar_layout })}
        />
      );
      break;
    case "look.hero":
      body = (
        <HeroStep
          catalog={catalog}
          brand={brand}
          theme={answers.theme}
          font={answers.font_family}
          value={answers.hero_style}
          onChange={(hero_style) => selectAndAdvance({ hero_style })}
        />
      );
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
          checkoutSessionId={checkoutSessionId}
        />
      );
      break;
    case "review":
      body = (
        <ReviewStep
          catalog={catalog}
          answers={answers}
          onEdit={(id) => {
            setDirection(-1);
            setStepId(id);
          }}
        />
      );
      break;
    default: {
      const page = step.id.replace("pages.", "");
      body = (
        <PageLayoutStep
          catalog={catalog}
          page={page}
          value={answers.page_layouts?.[page]}
          onChange={(layoutId) =>
            selectAndAdvance({
              page_layouts: {
                ...(answers.page_layouts ?? {}),
                [page]: layoutId,
              },
            })
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
      stepId={step.id}
      direction={direction}
      progress={progressPct(steps, step.id)}
      canBack={Boolean(prevStep(steps, step.id))}
      onBack={handleBack}
      showFinishRest={step.chapter !== "business" && step.id !== "review"}
      onFinishRest={handleFinishRest}
      error={error}
      wide={
        step.chapter === "pages" ||
        step.id === "look.theme" ||
        step.id === "look.hero"
      }
      footer={
        autoAdvance ? null : (
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="w-full max-w-[340px]"
            onClick={handleContinue}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {step.id === "review"
                    ? t("review.creating")
                    : t("common.saving")}
                </span>
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
        )
      }
    >
      {body}
    </WizardShell>
  );
}
