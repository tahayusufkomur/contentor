"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  composeWizard,
  finalizeWizard,
  getDescribeFollowups,
  getWizardCatalog,
  patchWizardState,
  readWizardState,
} from "@/lib/wizard/api";
import {
  CHAPTERS,
  CONTENT_CHAPTERS,
  buildContentSteps,
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
import { BASE_DOMAIN } from "@/lib/constants";
import { ApiError } from "@/types/api";

import { WizardShell } from "./WizardShell";
import {
  DescribeStep,
  FollowupsStep,
  FontStep,
  GoalsStep,
  NicheStep,
  ThemeStep,
} from "./steps";
import { LogoStep, ReviewStep } from "./logo-review-steps";
import {
  BlogStep,
  CourseStep,
  EventStep,
  ProvisioningGate,
} from "./content-steps";
import { DomainStep } from "./domain-step";

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
  const [bucket, setBucket] = useState("");
  // The content flow's compose response carries no slug (the tenant already
  // exists), so keep the one readWizardState gave us for the reveal handoff.
  const [slug, setSlug] = useState("");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    Promise.all([getWizardCatalog(), readWizardState(token)])
      .then(([cat, res]) => {
        // "provisioned" is mid-wizard for the content flow (the schema is made
        // early so content steps can write); only the classic terminal states
        // mean the wizard is over. Mirrors WIZARD_OPEN_STATUSES on the server.
        if (
          !["pending", "provisioned"].includes(res.status) ||
          ["seeding", "ready", "skipped"].includes(res.template_status)
        ) {
          onProvisioning(res.slug);
          return;
        }
        const loaded = res.state.answers ?? {};
        const loadedBucket = res.wizard_bucket ?? "";
        setCatalog(cat);
        setAnswers(loaded);
        setBucket(loadedBucket);
        setSlug(res.slug);
        const steps =
          loadedBucket === "treatment"
            ? buildContentSteps(cat, loaded)
            : buildSteps(cat, loaded);
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

  // The holdout picks the flow. Empty bucket (tenants created before the
  // experiment) falls through to the classic wizard — never crash on missing.
  const isContentFlow = bucket === "treatment";
  const steps = useMemo(
    () =>
      catalog
        ? isContentFlow
          ? buildContentSteps(catalog, answers)
          : buildSteps(catalog, answers)
        : [],
    [isContentFlow, catalog, answers],
  );
  // A saved step this build no longer has (e.g. a removed layout step) resumes
  // at the first unanswered step, never back at the very first question.
  const step =
    steps.find((s) => s.id === stepId) ??
    (steps.length > 0 ? firstUnansweredStep(steps, answers) : undefined);

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

  // Content steps own their own save (they POST a real course/event/post),
  // so they only need the flag persisted and the wizard advanced. Skipping
  // advances with no flag: the publish gate and admin checklist catch the gap.
  const advanceContent = useCallback(
    (patch: Partial<WizardAnswers>) => {
      if (!step || busy) return;
      const next = nextStep(steps, step.id);
      setDirection(1);
      void commit(patch, next?.id ?? "review");
    },
    [commit, steps, step, busy],
  );
  const commitContent = useCallback(
    (patch: Partial<WizardAnswers>) => advanceContent(patch),
    [advanceContent],
  );
  const skipContent = useCallback(() => advanceContent({}), [advanceContent]);

  const handleContinue = async () => {
    if (!catalog || !step || busy) return;
    if (step.id === "review") {
      setBusy(true);
      setError(null);
      try {
        // Content flow: the schema and the coach's real content already exist,
        // so the reveal only needs the compose step (Plan 3d). Classic runs the
        // full provision_tenant pipeline via finalize.
        if (isContentFlow) {
          await composeWizard(token);
          onProvisioning(slug || undefined);
        } else {
          const res = await finalizeWizard(token);
          onProvisioning(res.slug);
        }
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
          <Spinner />
        )}
      </div>
    );
  }

  // Steps whose pick IS the advance render no Continue button. Nothing on
  // them is pre-checked either — a checked card with no way forward reads as
  // a dead end. "Finish the rest for me" stays the bulk-accept escape hatch,
  // and finalize still fills any never-answered key with the recommendation.
  const autoAdvance = step.chapter === "look" || step.id === "business.niche";
  // Content steps carry their own Continue (it POSTs a real course/event/post
  // before advancing) plus a Skip link, so the shell must not add a second one.
  // The domain step owns its advance the same way (buy / skip / later).
  const stepOwnsAdvance =
    autoAdvance || step.chapter === "content" || step.id === "domain";

  let body: React.ReactNode;
  switch (step.id) {
    case "business.niche":
      body = (
        <NicheStep
          catalog={catalog}
          value={answers.niche}
          onChange={(niche) => selectAndAdvance({ niche })}
          disabled={busy}
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
          disabled={busy}
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
          disabled={busy}
        />
      );
      break;
    case "content.course":
      body = (
        <ProvisioningGate token={token}>
          <CourseStep
            token={token}
            answers={answers}
            onDone={commitContent}
            onSkip={skipContent}
          />
        </ProvisioningGate>
      );
      break;
    case "content.event":
      body = (
        <ProvisioningGate token={token}>
          <EventStep
            token={token}
            answers={answers}
            onDone={commitContent}
            onSkip={skipContent}
          />
        </ProvisioningGate>
      );
      break;
    case "content.blog":
      body = (
        <ProvisioningGate token={token}>
          <BlogStep
            token={token}
            answers={answers}
            onDone={commitContent}
            onSkip={skipContent}
          />
        </ProvisioningGate>
      );
      break;
    case "logo":
      body = (
        <LogoStep
          token={token}
          brand={brand}
          niche={answers.niche}
          description={answers.description}
          theme={answers.theme}
          font={answers.font_family}
          value={answers.logo}
          onChange={(logo) => draft({ logo })}
          initialUpgraded={initialUpgraded}
          checkoutSessionId={checkoutSessionId}
        />
      );
      break;
    case "domain":
      body = (
        <DomainStep
          token={token}
          brand={brand}
          value={answers.custom_domain}
          onDone={commitContent}
          disabled={busy}
        />
      );
      break;
    case "review":
      body = (
        <ReviewStep
          answers={answers}
          steps={steps}
          brand={brand}
          address={slug ? `${slug}.${BASE_DOMAIN}` : ""}
          onEdit={(id) => {
            setDirection(-1);
            setStepId(id);
          }}
        />
      );
      break;
  }

  return (
    <WizardShell
      chapter={step.chapter}
      chapters={isContentFlow ? CONTENT_CHAPTERS : CHAPTERS}
      stepId={step.id}
      direction={direction}
      progress={progressPct(steps, step.id)}
      canBack={Boolean(prevStep(steps, step.id))}
      onBack={handleBack}
      showFinishRest={
        !isContentFlow && step.chapter !== "business" && step.id !== "review"
      }
      onFinishRest={handleFinishRest}
      error={error}
      wide={step.id === "look.theme"}
      footer={
        stepOwnsAdvance ? null : (
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="w-full max-w-[340px]"
            onClick={handleContinue}
            loading={busy}
            loadingText={
              step.id === "review" ? t("review.creating") : t("common.saving")
            }
          >
            {step.id === "review" ? (
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
