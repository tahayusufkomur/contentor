"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import {
  setupFlowApi,
  type ContentKind,
  type SetupFlowApi,
  type SetupFlowState,
  type SetupStep,
} from "@/lib/setup-flow";
import { ApiError } from "@/types/api";
import { cn } from "@/lib/utils";
import { BrowserFrame, Composing, type Device } from "./browser-frame";
import { ChatPanel } from "./chat-panel";
import { ContentQuestion } from "./content-question";
import { Celebration, LaunchPanel } from "./launch";
import { mockSetupFlowApi } from "./mock";
import { PayoutsCard } from "./payouts-card";
import { SetupSkeleton } from "./skeleton";
import { MobileHeader, StepRail, progressOf } from "./step-rail";
import { Welcome } from "./welcome";
import { SHELL_CSS, SHELL_TOKENS } from "./tokens";

type Stages = [string, string, string];
const PAGE_STAGES: Stages = [
  "Choosing the layout",
  "Writing your copy",
  "Finding your photos",
];
const CONTENT_STAGES: Record<ContentKind, Stages> = {
  course: [
    "Shaping the outline",
    "Writing the lessons and description",
    "Finding a cover photo",
  ],
  event: [
    "Picking a date and time",
    "Writing the description",
    "Finding a cover photo",
  ],
  post: ["Outlining the article", "Writing the draft", "Finding a cover photo"],
};

const CHIPS: Record<string, string[]> = {
  page: [
    "Make the headline punchier",
    "Use a warmer photo for the hero",
    "Try a bolder style",
  ],
  course: [
    "Make it a 4-week program",
    "Set the price to 49",
    "Rewrite the description to sound warmer",
  ],
  event: [
    "Move it to Sunday morning",
    "Make it free to join",
    "Shorten the description",
  ],
  post: [
    "Make the intro more personal",
    "Add a section of practical tips",
    "Cut it to a 3-minute read",
  ],
  payouts: [
    "How do payouts work?",
    "What will students see at checkout?",
    "Can I still offer free courses?",
  ],
  launch: [
    "Is anything missing before I publish?",
    "Give the home page a final polish",
    "Make the home headline punchier",
  ],
};

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

export function SetupFlow({
  brandName,
  logoUrl,
  host,
  mock,
  fontClassName,
}: {
  brandName: string;
  logoUrl: string;
  host: string;
  mock: boolean;
  fontClassName: string;
}) {
  const api = mock ? mockSetupFlowApi : setupFlowApi;
  const [flow, setFlow] = useState<SetupFlowState | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setFlow(await api.get());
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? new Error("Guided setup isn’t available for this site yet.")
          : err,
      );
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      style={SHELL_TOKENS}
      className={cn(
        fontClassName,
        "sf-shell h-dvh overflow-hidden antialiased",
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
      <PageState
        loading={!flow && !loadError}
        error={loadError}
        onRetry={load}
        skeleton={<SetupSkeleton />}
        className="h-full"
      >
        {flow && (
          <Flow
            flow={flow}
            setFlow={setFlow}
            api={api}
            brandName={flow.brand_name || brandName}
            logoUrl={logoUrl}
            host={host}
          />
        )}
      </PageState>
    </div>
  );
}

function Flow({
  flow,
  setFlow,
  api,
  brandName,
  logoUrl,
  host,
}: {
  flow: SetupFlowState;
  setFlow: Dispatch<SetStateAction<SetupFlowState | null>>;
  api: SetupFlowApi;
  brandName: string;
  logoUrl: string;
  host: string;
}) {
  const navigate = useNavigate();
  const narrow = useNarrow();
  const [tab, setTab] = useState<"preview" | "chat">("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [buildFailed, setBuildFailed] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [startOver, setStartOver] = useState(false);
  const [payoutsReady, setPayoutsReady] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const steps = flow.steps;
  const step: SetupStep | undefined =
    steps.find((s) => s.id === flow.step) ??
    steps.find((s) => s.state === "active") ??
    steps[0];
  const index = step ? steps.indexOf(step) : 0;

  // First landing (nothing settled yet, not dismissed on this browser): a
  // welcome panel before the first question. Per-viewer flag; storage may
  // be unavailable (private mode), in which case the welcome just shows.
  const welcomeKey = `setup-welcome:${flow.slug}`;
  const [welcome, setWelcome] = useState(() => {
    if (progressOf(flow.steps).settled > 0) return false;
    try {
      return !window.localStorage.getItem(welcomeKey);
    } catch {
      return true;
    }
  });
  const startFlow = () => {
    try {
      window.localStorage.setItem(welcomeKey, "1");
    } catch {
      // Not remembered — harmless, the welcome shows once more next visit.
    }
    setWelcome(false);
  };

  useEffect(() => {
    setStartOver(false);
    setDraftPath(null);
  }, [step?.id]);

  const refresh = useCallback(async () => {
    try {
      setFlow(await api.get());
    } catch {
      // A missed poll is harmless; the next one catches up.
    }
  }, [api, setFlow]);

  // ── Page steps: request the build when idle, poll while composing ──────
  const pageKey = step?.kind === "page" ? (step.page_key ?? null) : null;
  const buildStatus = pageKey
    ? (flow.page_builds[pageKey]?.status ?? "idle")
    : null;
  const requested = useRef(new Set<string>());
  const requestBuild = useCallback(
    async (page: string, force = false) => {
      setBuildFailed(null);
      try {
        await api.buildPage(page, force);
        await refresh();
      } catch {
        setBuildFailed(page);
      }
    },
    [api, refresh],
  );
  useEffect(() => {
    if (!pageKey || buildStatus !== "idle") return;
    if (requested.current.has(pageKey)) return;
    requested.current.add(pageKey);
    void requestBuild(pageKey);
  }, [pageKey, buildStatus, requestBuild]);
  const pageFailed =
    pageKey != null && (buildStatus === "failed" || buildFailed === pageKey);
  const composingPage =
    pageKey != null &&
    !pageFailed &&
    (buildStatus === "building" || buildStatus === "idle");
  useEffect(() => {
    if (!composingPage) return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [composingPage, refresh]);

  const { run: retryBuild, loading: retrying } = useAsyncAction(async () => {
    if (pageKey) await requestBuild(pageKey, true);
  });

  // ── Content steps ──────────────────────────────────────────────────────
  const contentKind =
    step?.kind === "content" ? (step.id as ContentKind) : null;
  const hasDraft = contentKind ? flow.content[contentKind] != null : false;
  const { run: draft } = useAsyncAction(
    async (prompt: string) => {
      if (!contentKind) return;
      setDrafting(true);
      try {
        const res = await api.draft(contentKind, prompt);
        setDraftPath(res.preview_path);
        setStartOver(false);
        setReloadKey((k) => k + 1);
        await refresh();
      } finally {
        setDrafting(false);
      }
    },
    { errorToast: "Couldn’t draft that. Try again, or say it differently." },
  );

  // ── Step moves ─────────────────────────────────────────────────────────
  const { run: goto, loading: going } = useAsyncAction(
    async (id: string) => {
      setFlow(await api.act({ action: "goto", step: id }));
      setTab("preview");
    },
    { errorToast: "Couldn’t open that step. Try again." },
  );
  const { run: complete, loading: completing } = useAsyncAction(
    async () => {
      if (step) setFlow(await api.act({ action: "complete", step: step.id }));
    },
    { errorToast: "Couldn’t save this step. Try again." },
  );
  const { run: skip, loading: skipping } = useAsyncAction(
    async () => {
      if (step) setFlow(await api.act({ action: "skip", step: step.id }));
    },
    { errorToast: "Couldn’t skip this step. Try again." },
  );
  const { run: publish, loading: publishing } = useAsyncAction(
    async () => {
      try {
        setFlow(await api.act({ action: "finish", publish: true }));
        setCelebrate(true);
      } catch (err) {
        const blockers =
          err instanceof ApiError ? err.data.blockers : undefined;
        if (Array.isArray(blockers)) {
          setFlow((prev) =>
            prev ? { ...prev, publish_blockers: blockers as string[] } : prev,
          );
          toast.error("A few things need finishing before you publish.");
          return;
        }
        throw err;
      }
    },
    { errorToast: "Couldn’t publish your site. Try again." },
  );
  const { run: later, loading: leaving } = useAsyncAction(
    async () => {
      await api.act({ action: "finish", publish: false });
      navigate("/admin");
    },
    { errorToast: "Couldn’t finish setup. Try again." },
  );

  // The welcome's live strip follows the background page builds.
  useEffect(() => {
    if (!welcome) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [welcome, refresh]);

  const onApplied = useCallback(() => {
    setReloadKey((k) => k + 1);
    void refresh();
  }, [refresh]);

  if (!step) return null;
  const busy = going || completing || skipping;
  const effectiveDevice: Device = narrow ? "phone" : device;
  const previewPath = step.preview_path ?? draftPath;

  // ── The stage for this step ───────────────────────────────────────────
  let stage: ReactNode;
  let framed = true;
  let overlay: ReactNode = null;
  if (step.kind === "content" && contentKind) {
    if (drafting) {
      overlay = (
        <Composing
          title={step.title}
          stages={CONTENT_STAGES[contentKind]}
          note="Usually ready in under a minute."
        />
      );
    } else if (!hasDraft || startOver) {
      framed = false;
      stage = (
        <ContentQuestion
          key={step.id}
          kind={contentKind}
          suggestions={flow.suggestions[contentKind] ?? []}
          drafting={drafting}
          onDraft={(prompt) => draft(prompt)}
          onKeepCurrent={hasDraft ? () => setStartOver(false) : undefined}
        />
      );
    }
  } else if (step.kind === "page") {
    if (pageFailed) {
      overlay = (
        <div className="absolute inset-0 flex items-center justify-center bg-[#FBFAF8] p-6">
          <div className="max-w-[380px] text-center">
            <p className="text-xl font-semibold tracking-[-0.015em]">
              This page didn’t come together
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--sf-graphite)]">
              Composing it stopped partway. Try again; it usually works on the
              second go.
            </p>
            <Button
              onClick={() => retryBuild()}
              loading={retrying}
              className="mt-5 rounded-full px-6"
            >
              Try again
            </Button>
          </div>
        </div>
      );
    } else if (composingPage) {
      overlay = (
        <Composing
          title={step.title}
          stages={PAGE_STAGES}
          note="Usually ready in under a minute."
        />
      );
    }
  } else if (step.kind === "payouts") {
    framed = false;
    stage = <PayoutsCard onReady={setPayoutsReady} />;
  }
  if (welcome) {
    framed = false;
    stage = <Welcome flow={flow} brandName={brandName} onStart={startFlow} />;
  }
  if (framed) {
    stage = (
      <BrowserFrame
        host={host}
        path={step.kind === "launch" ? (previewPath ?? "/") : previewPath}
        device={effectiveDevice}
        reloadKey={reloadKey}
        onReload={overlay ? undefined : () => setReloadKey((k) => k + 1)}
        overlay={overlay}
      />
    );
  }

  const primaryDisabled =
    (step.kind === "content" && (!hasDraft || startOver || drafting)) ||
    (step.kind === "page" && buildStatus !== "ready") ||
    (step.kind === "payouts" && !payoutsReady);

  const chips =
    step.kind === "content" && !hasDraft
      ? []
      : (CHIPS[contentKind ?? step.kind] ?? []);
  const context = `[On the "${step.title}" step, previewing ${previewPath ?? "nothing yet"}]`;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <StepRail
        steps={steps}
        brandName={brandName}
        logoUrl={logoUrl}
        onGoto={(id) => goto(id)}
        busy={busy}
      />
      <MobileHeader
        steps={steps}
        brandName={brandName}
        logoUrl={logoUrl}
        activeTitle={welcome ? "Welcome" : step.title}
        tab={tab}
        onTab={setTab}
      />

      <main
        className={cn(
          "relative min-h-0 min-w-0 flex-1 flex-col bg-[var(--sf-wall)]",
          tab === "chat" ? "hidden lg:flex" : "flex",
        )}
        style={{
          // Lit from above, edges falling off softly: a quiet wall for the
          // coach's site to hang on.
          backgroundImage:
            "radial-gradient(90% 60% at 50% 8%, var(--sf-wall-lit), transparent 72%), radial-gradient(140% 110% at 50% 45%, transparent 55%, rgb(72 52 28 / 0.07))",
        }}
      >
        <div
          className={cn(
            "hidden h-[60px] shrink-0 items-center justify-between gap-6 px-7",
            !welcome && "lg:flex",
          )}
        >
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">
              {step.title}
            </h1>
            {step.subtitle && (
              <p className="truncate text-[13px] text-[var(--sf-graphite)]">
                {step.subtitle}
              </p>
            )}
          </div>
          {framed && (
            <div
              role="radiogroup"
              aria-label="Preview size"
              className="flex shrink-0 rounded-full bg-[rgb(255_255_255/0.6)] p-0.5 ring-1 ring-[var(--sf-line)]"
            >
              {(
                [
                  ["desktop", Monitor, "Desktop"],
                  ["phone", Smartphone, "Phone"],
                ] as const
              ).map(([d, Icon, label]) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={device === d}
                  aria-label={label}
                  title={label}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "rounded-full px-2.5 py-1.5 transition-colors",
                    device === d
                      ? "bg-white text-[var(--sf-ink)] shadow-[0_1px_2px_rgb(48_36_20/0.12)]"
                      : "text-[var(--sf-faint)] hover:text-[var(--sf-ink)]",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className={cn(
            "min-h-0 flex-1",
            framed && "px-3 py-3 lg:px-7 lg:py-0",
          )}
        >
          {stage}
        </div>

        {welcome ? null : step.kind === "launch" ? (
          <LaunchPanel
            blockers={flow.publish_blockers}
            stepIds={steps.map((s) => s.id)}
            onFix={(id) => goto(id)}
            onPublish={() => publish()}
            onLater={() => later()}
            publishing={publishing}
            leaving={leaving}
          />
        ) : (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--sf-line)] bg-[var(--sf-paper)] px-4 py-3 lg:border-0 lg:bg-transparent lg:px-7 lg:py-4">
            <span className="hidden text-[13px] tabular-nums text-[var(--sf-graphite)] sm:block">
              Step {index + 1} of {steps.length}
            </span>
            <div className="flex flex-1 items-center justify-end gap-2">
              {step.kind === "content" && hasDraft && !startOver && (
                <Button
                  variant="ghost"
                  onClick={() => setStartOver(true)}
                  disabled={drafting || busy}
                  className="rounded-full"
                >
                  Start over
                </Button>
              )}
              {step.optional && (
                <Button
                  variant="ghost"
                  onClick={() => skip()}
                  loading={skipping}
                  disabled={completing || going}
                  className="rounded-full"
                >
                  Skip for now
                </Button>
              )}
              <Button
                size="lg"
                onClick={() => complete()}
                loading={completing}
                disabled={primaryDisabled || skipping || going}
                className="rounded-full px-6"
              >
                {step.kind === "payouts" ? "Continue" : "Looks good — continue"}
              </Button>
            </div>
          </div>
        )}

        {celebrate && (
          <Celebration
            brandName={brandName}
            host={host}
            onDashboard={() => navigate("/admin")}
          />
        )}
      </main>

      <ChatPanel
        brandName={brandName}
        context={context}
        chips={chips}
        onApplied={onApplied}
        className={
          tab === "preview" ? "hidden lg:flex" : "flex flex-1 lg:flex-none"
        }
      />
    </div>
  );
}
