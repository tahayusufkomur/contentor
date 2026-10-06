"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Eye, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { executeCopilotAction, undoCopilotAction } from "@/lib/copilot/api";
import { isUndoableKind, runBundle } from "@/lib/copilot/state";
import {
  activityLine,
  finishedNotes,
  landedPage,
  pageLabel,
  questionSteps,
  stageIndex,
} from "@/lib/interview";
import {
  setupFlowApi,
  type CopilotPayload,
  type GuideTurn,
  type SetupFlowApi,
  type SetupFlowState,
  type TurnRequest,
} from "@/lib/setup-flow";
import { announceSiteUpdated } from "@/lib/site-events";
import { ApiError } from "@/types/api";
import { cn } from "@/lib/utils";
import { BrowserFrame, Composing, type Device } from "./browser-frame";
import { GoLivePanel } from "./golive-panel";
import { Celebration } from "./launch";
import { mockSetupFlowApi } from "./mock";
import { QuestionScreen, type StepDraft } from "./question-screen";
import { SetupSkeleton } from "./skeleton";
import { SHELL_CSS, SHELL_TOKENS } from "./tokens";

type Stages = [string, string, string];
const PAGE_STAGES: Stages = [
  "Choosing the layout",
  "Writing your copy",
  "Finding your photos",
];
const WALL: CSSProperties = {
  backgroundImage:
    "radial-gradient(90% 60% at 50% 8%, var(--sf-wall-lit), transparent 72%), radial-gradient(140% 110% at 50% 45%, transparent 55%, rgb(72 52 28 / 0.07))",
};

const GOLIVE = "__golive";

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
  host,
  mock,
  fontClassName,
}: {
  brandName: string;
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
  host,
}: {
  flow: SetupFlowState;
  setFlow: Dispatch<SetStateAction<SetupFlowState | null>>;
  api: SetupFlowApi;
  brandName: string;
  host: string;
}) {
  const navigate = useNavigate();
  const narrow = useNarrow();
  const iv = flow.interview;
  // The live guide keeps what only a turn's reply carries (the status line).
  const [guide, setGuide] = useState<GuideTurn>(iv.guide);
  const steps = useMemo(
    () => questionSteps(iv.turns, guide),
    [iv.turns, guide],
  );
  // null = the live question; a number = an earlier one the coach went back to.
  const [at, setAt] = useState<number | null>(null);
  const index = Math.min(at ?? steps.length - 1, steps.length - 1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tab, setTab] = useState<"guide" | "preview">("guide");
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [path, setPath] = useState("/");
  const [celebrate, setCelebrate] = useState(false);
  const seen = useRef({ builds: flow.page_builds, drafts: iv.draft_status });

  const golive = iv.phase === "golive";
  const started = iv.phase !== "interview";
  const working =
    Object.values(flow.page_builds).some((b) => b.status === "building") ||
    Object.values(iv.draft_status).some((s) => s === "building");
  const activity = activityLine(flow.page_builds, iv.draft_status);

  const refresh = useCallback(async () => {
    try {
      setFlow(await api.get());
    } catch {
      // A missed poll is harmless; the next one catches up.
    }
  }, [api, setFlow]);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [working, refresh]);

  // Work that finished since the last poll: the guide says so, and the
  // preview moves to a page that just finished composing.
  useEffect(() => {
    const next = { builds: flow.page_builds, drafts: iv.draft_status };
    const notes = finishedNotes(seen.current, next);
    const key = landedPage(seen.current.builds, next.builds);
    seen.current = next;
    for (const note of notes)
      toast.success(
        note,
        golive
          ? undefined
          : {
              action: { label: "Preview", onClick: () => setPreviewOpen(true) },
            },
      );
    if (!key) return;
    setPath(flow.steps.find((s) => s.page_key === key)?.preview_path ?? "/");
    setReloadKey((k) => k + 1);
  }, [flow.page_builds, iv.draft_status, flow.steps, golive]);

  useEffect(() => {
    if (!previewOpen) return;
    const close = (e: KeyboardEvent) =>
      e.key === "Escape" && setPreviewOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [previewOpen]);

  const { run: undo } = useAsyncAction(
    async (auditId: number) => {
      await undoCopilotAction(auditId);
      announceSiteUpdated();
      setReloadKey((k) => k + 1);
      toast.success("Change undone");
    },
    { errorToast: "Couldn’t undo that. Try again." },
  );

  const applyEdit = useCallback(
    async (edit: CopilotPayload) => {
      if (edit.kind !== "actions" || !edit.actions?.length) {
        if (edit.text) toast.message(edit.text);
        return;
      }
      const titles: string[] = [];
      let auditId: number | undefined;
      const { failed } = await runBundle(
        edit.actions.map((card) => async () => {
          const res = await executeCopilotAction(card.token);
          titles.push(card.title);
          if (res.audit_id != null && isUndoableKind(card.kind))
            auditId = res.audit_id;
        }),
      );
      if (titles.length) {
        announceSiteUpdated();
        setReloadKey((k) => k + 1);
        void refresh();
      }
      const text = failed
        ? `Changed: ${titles.join(", ")}. The rest didn’t go through. Ask again to finish.`
        : `Done: ${titles.join(", ")}.`;
      const id = auditId;
      toast.success(
        text,
        id == null
          ? undefined
          : { action: { label: "Undo", onClick: () => void undo(id) } },
      );
    },
    [refresh, undo],
  );

  // Unsent ticks and text per question (by field; the go-live box under
  // GOLIVE), kept while the coach moves between questions.
  const [drafts, setDrafts] = useState<Record<string, StepDraft>>({});
  const editDraft = (key: string) => (update: (d: StepDraft) => StepDraft) =>
    setDrafts((all) => ({ ...all, [key]: update(all[key] ?? {}) }));
  const dropDraft = (key: string) =>
    setDrafts(({ [key]: _sent, ...rest }) => rest);

  const { run: send, loading: sending } = useAsyncAction(
    async (req: TurnRequest) => {
      const serverTurns = flow.interview.turns.length;
      const key = req.choice?.field ?? req.field ?? guide.field ?? GOLIVE;
      try {
        const res = await api.turn(req);
        setGuide(res.guide);
        setFlow(res.state);
        setAt(null);
        dropDraft(key);
        if (res.edit) await applyEdit(res.edit);
      } catch (err) {
        // A slow turn can be cut off by the proxy after the server finished
        // it: adopt the server's transcript instead of losing the answer.
        const fresh = await api.get().catch(() => null);
        if (fresh && fresh.interview.turns.length > serverTurns) {
          setFlow(fresh);
          setGuide(fresh.interview.guide);
          setAt(null);
          dropDraft(key);
          return;
        }
        throw err; // the answer is still in its box
      }
    },
    { errorToast: "That didn’t go through. Your answer is still in the box." },
  );

  const currentPage = flow.steps.find((s) => s.preview_path === path)?.page_key;
  const build = currentPage ? flow.page_builds[currentPage] : undefined;
  // A failed build shows its first version instead of composing forever.
  const composing =
    !!build && build.status !== "ready" && build.status !== "failed";
  const frame = (
    <BrowserFrame
      host={host}
      path={path}
      device={narrow ? "phone" : device}
      reloadKey={reloadKey}
      onReload={composing ? undefined : () => setReloadKey((k) => k + 1)}
      overlay={
        composing && currentPage ? (
          <Composing
            title={`Building your ${pageLabel(currentPage)}`}
            stages={PAGE_STAGES}
            current={stageIndex(build?.stage)}
            note="Usually ready in under a minute."
          />
        ) : null
      }
    />
  );
  const toggle = narrow ? null : (
    <DeviceToggle device={device} onDevice={setDevice} />
  );

  if (!golive) {
    const step = steps[index];
    const total = Math.max(steps.length - 1 + iv.remaining, index + 1);
    const live = index === steps.length - 1;
    return (
      <div className="flex h-full flex-col">
        <header className="flex h-16 shrink-0 items-center gap-1.5 border-b border-[var(--sf-line)] px-3 sm:gap-3 sm:px-6">
          <NavButton
            label="Previous question"
            disabled={index === 0 || sending}
            onClick={() => setAt(index - 1)}
          >
            <ArrowLeft className="size-4" aria-hidden />
          </NavButton>
          <div className="min-w-0 flex-1 px-1">
            <div className="flex items-baseline justify-between gap-3 text-[12px] text-[var(--sf-faint)]">
              <span className="truncate font-medium text-[var(--sf-graphite)]">
                {brandName}
              </span>
              <span className="shrink-0">
                Question {index + 1} of about {total}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--sf-line)]">
              <div
                className="h-full rounded-full bg-[var(--sf-ink)] transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.round((index / total) * 100)}%` }}
              />
            </div>
          </div>
          <NavButton
            label="Next question"
            disabled={live || sending}
            onClick={() =>
              setAt(index + 1 >= steps.length - 1 ? null : index + 1)
            }
          >
            <ArrowRight className="size-4" aria-hidden />
          </NavButton>
          {started && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              className="ml-1 max-w-[44vw] rounded-full bg-white"
            >
              {activity ? (
                <Spinner size="sm" className="text-[var(--sf-brass)]" />
              ) : (
                <Eye aria-hidden />
              )}
              <span className="truncate">
                {activity ?? "Preview your site"}
              </span>
            </Button>
          )}
        </header>
        <section
          aria-label="Your setup guide"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {step && (
            <QuestionScreen
              key={`${index}:${step.field}:${iv.turns.length}`}
              step={step}
              cards={
                live ? step.cards : step.field ? iv.cards?.[step.field] : null
              }
              live={live}
              sending={sending}
              draft={drafts[step.field ?? GOLIVE] ?? {}}
              onDraft={editDraft(step.field ?? GOLIVE)}
              onSend={(req) => void send(req)}
              onMoreLogos={api.logos}
            />
          )}
        </section>
        {previewOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Your site so far"
            className="fixed inset-0 z-40 flex flex-col bg-[var(--sf-wall)] motion-safe:animate-fade-in"
            style={WALL}
          >
            <PreviewPane
              start={
                <p className="flex min-w-0 items-center gap-2 text-[14px] text-[var(--sf-graphite)]">
                  {activity && (
                    <Spinner size="sm" className="text-[var(--sf-brass)]" />
                  )}
                  <span className="truncate">
                    {activity ?? "Your site so far"}
                  </span>
                </p>
              }
              end={
                <>
                  {toggle}
                  <Button
                    autoFocus
                    size="sm"
                    onClick={() => setPreviewOpen(false)}
                    className="rounded-full px-4"
                  >
                    Back to the questions
                  </Button>
                </>
              }
            >
              {frame}
            </PreviewPane>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {narrow && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--sf-line)] bg-[var(--sf-paper)] px-4">
          <span className="truncate text-sm font-semibold">{brandName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTab(tab === "guide" ? "preview" : "guide")}
            className="rounded-full"
          >
            {tab === "guide" ? "See your site" : "Back to go-live"}
          </Button>
        </div>
      )}
      <main
        className={cn(
          "relative min-h-0 min-w-0 flex-1 flex-col bg-[var(--sf-wall)] motion-safe:animate-fade-in",
          narrow && tab !== "preview" ? "hidden" : "flex",
        )}
        style={WALL}
      >
        <PreviewPane end={toggle}>{frame}</PreviewPane>
        {celebrate && (
          <Celebration
            brandName={brandName}
            host={host}
            onDashboard={() => navigate("/admin")}
          />
        )}
      </main>
      <GoLivePanel
        guide={guide}
        api={api}
        sending={sending}
        activity={activity}
        text={drafts[GOLIVE]?.text ?? ""}
        onText={(update) =>
          editDraft(GOLIVE)((d) => ({ ...d, text: update(d.text ?? "") }))
        }
        onSend={(req) => void send(req)}
        onPublished={() => setCelebrate(true)}
        className={cn(
          "lg:w-[440px] lg:shrink-0 lg:border-l lg:border-[var(--sf-line)]",
          narrow && tab !== "guide" ? "hidden" : "flex flex-1 lg:flex-none",
        )}
      />
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--sf-ink)] transition-colors hover:bg-[var(--sf-tint-strong)] disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}

/** The live site in its browser frame, under a toolbar row. */
function PreviewPane({
  start,
  end,
  children,
}: {
  start?: ReactNode;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[60px] shrink-0 items-center gap-3 px-3 lg:px-7">
        {start}
        <div className="ml-auto flex shrink-0 items-center gap-2">{end}</div>
      </div>
      <div className="min-h-0 flex-1 px-3 pb-3 lg:px-7 lg:pb-6">{children}</div>
    </div>
  );
}

function DeviceToggle({
  device,
  onDevice,
}: {
  device: Device;
  onDevice: (d: Device) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Preview size"
      className="flex rounded-full bg-[rgb(255_255_255/0.6)] p-0.5 ring-1 ring-[var(--sf-line)]"
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
          onClick={() => onDevice(d)}
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
  );
}
