"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, Eye, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { PageState } from "@/components/ui/page-state";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { executeCopilotAction, undoCopilotAction } from "@/lib/copilot/api";
import { isUndoableKind, runBundle } from "@/lib/copilot/state";
import {
  activityLine,
  finishedNotes,
  landedPage,
  nextToReview,
  pageLabel,
  questionSteps,
  reviewPages,
  scheduleSummary,
  SECTIONS,
  sectionOf,
  priceOk,
  stageIndex,
  type ReviewPage,
} from "@/lib/interview";
import {
  isPhotos,
  isReview,
  setupFlowApi,
  turnErrorText,
  type CopilotPayload,
  type GuideTurn,
  type SetupFlowApi,
  type SetupFlowState,
  type TeamLine,
  type TurnRequest,
} from "@/lib/setup-flow";
import { announceSiteUpdated } from "@/lib/site-events";
import type { SelectionPayload } from "@/lib/copilot/types";
import type { ShareDoc } from "@/lib/share-doc";
import { ApiError } from "@/types/api";
import { cn } from "@/lib/utils";
import { BrowserFrame, Composing, type Device } from "./browser-frame";
import { PageEditor } from "./page-editor";
import { GoLivePanel } from "./golive-panel";
import { Celebration } from "./launch";
import { mockSetupFlowApi } from "./mock";
import type { BuilderData } from "./builder-preview";
import { BioScreen, NameScreen } from "./opening-screens";
import { PhotosScreen } from "./photos-screen";
import { QuestionScreen, type StepDraft } from "./question-screen";
import { SetupMenu } from "./setup-menu";
import { SetupSkeleton } from "./skeleton";
import { SHELL_CSS, SHELL_TOKENS } from "./tokens";
import { useLocale } from "next-intl";

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
// The interview opens on these, each a screen of its own (opening-screens).
const OPENERS = ["bio", "site_name"];

/** Moves to another question as a slide: the outgoing one leaves in the
 * travel direction while the new one lands (CSS on the view-transition
 * pseudo-elements in tokens.ts). Without view transitions, or with reduced
 * motion, the screen simply switches. Resolves once the new question is in
 * the DOM: the transition applies the update a frame later, and until then
 * the old question must not come back to life. */
function slide(dir: "next" | "back", update: () => void): Promise<void> {
  if (
    typeof document === "undefined" ||
    !("startViewTransition" in document) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return Promise.resolve();
  }
  document.documentElement.dataset.sfDir = dir;
  return document
    .startViewTransition(() => flushSync(update))
    .updateCallbackDone.catch(() => undefined);
}

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
  email = "",
  host,
  mock,
  fontClassName,
}: {
  brandName: string;
  /** The coach's own email: "Finish later" sends a sign-in link to it. */
  email?: string;
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
        "sf-shell relative isolate h-dvh overflow-clip antialiased",
      )}
    >
      <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
      {/* A slow drift of warm light behind the questions. */}
      <div aria-hidden className="sf-backdrop" />
      <div className="relative z-10 h-full">
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
              email={email}
              host={host}
            />
          )}
        </PageState>
      </div>
    </div>
  );
}

function Flow({
  flow,
  setFlow,
  api,
  brandName,
  email,
  host,
}: {
  flow: SetupFlowState;
  setFlow: Dispatch<SetStateAction<SetupFlowState | null>>;
  api: SetupFlowApi;
  brandName: string;
  email: string;
  host: string;
}) {
  const locale = useLocale();
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
  const [dir, setDir] = useState<"next" | "back">("next");
  const lastIndex = steps.length - 1;
  const goBack = useCallback(
    () =>
      slide("back", () => {
        setDir("back");
        setAt(index - 1);
      }),
    [index],
  );
  const goNext = useCallback(
    () =>
      slide("next", () => {
        setDir("next");
        setAt(index + 1 >= lastIndex ? null : index + 1);
      }),
    [index, lastIndex],
  );
  const [tab, setTab] = useState<"guide" | "preview">("guide");
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const [path, setPath] = useState("/");
  const [celebrate, setCelebrate] = useState<TeamLine[] | null>(null);
  // While a page is under review: the section she tapped in the preview
  // (the change she asks for is to it), and the one just changed (the
  // reloaded page opens on it).
  const [picked, setPicked] = useState<{
    selection: SelectionPayload;
    label: string;
  } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // The page under review open in the site's editor (held as opened: a poll
  // that moves the review on must not reload the frame under her hands).
  const [editing, setEditing] = useState<ReviewPage | null>(null);
  useEffect(() => {
    setPicked(null);
    setFlash(null);
  }, [path]);
  // The home page, peeked at mid-setup.
  const [peek, setPeek] = useState(false);
  const homeReady = flow.page_builds.home?.status === "ready";
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPeek(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peek]);
  const seen = useRef({ builds: flow.page_builds, drafts: iv.draft_status });

  const golive = iv.phase === "golive";
  const started = iv.phase !== "interview";
  const working =
    Object.values(flow.page_builds).some((b) => b.status === "building") ||
    Object.values(iv.draft_status).some((s) => s === "building");
  const activity = activityLine(flow.page_builds, iv.draft_status);

  // A turn on its way owns the transcript until its reply has landed. The
  // server saves the answer before it finishes the reply (the look cards
  // alone take seconds), so a poll in between would bring back the question
  // just answered, as if it were asked again. Polls that overlap a turn are
  // dropped; the reply carries the same state.
  const turnBusy = useRef(false);
  const turnEpoch = useRef(0);
  const holdPolls = useCallback(async <T,>(work: () => Promise<T>) => {
    turnBusy.current = true;
    turnEpoch.current += 1;
    try {
      return await work();
    } finally {
      turnBusy.current = false;
      turnEpoch.current += 1;
    }
  }, []);
  const refresh = useCallback(async () => {
    const epoch = turnEpoch.current;
    try {
      const fresh = await api.get();
      if (!turnBusy.current && turnEpoch.current === epoch) setFlow(fresh);
    } catch {
      // A missed poll is harmless; the next one catches up.
    }
  }, [api, setFlow]);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [working, refresh]);

  // Work that finished since the last poll: at go-live the guide says so
  // and the preview reloads; it stays on the page the coach is looking at
  // (Home first), never jumping to whichever page finished last. During
  // the questions the site stays out of sight; the header says what is
  // being built.
  useEffect(() => {
    const next = { builds: flow.page_builds, drafts: iv.draft_status };
    const notes = finishedNotes(seen.current, next);
    const key = landedPage(seen.current.builds, next.builds);
    seen.current = next;
    if (!golive) return;
    for (const note of notes) toast.success(note);
    if (!key) return;
    setReloadKey((k) => k + 1);
  }, [flow.page_builds, iv.draft_status, golive]);

  const { run: undo, loading: undoing } = useAsyncAction(
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
  // The dev mock opens the live question with last time's answer picked.
  const preset = (key: string): StepDraft =>
    (key === guide.field ? api.preset?.(key) : undefined) ?? {};
  const editDraft = (key: string) => (update: (d: StepDraft) => StepDraft) =>
    setDrafts((all) => ({ ...all, [key]: update(all[key] ?? preset(key)) }));
  const dropDraft = (key: string) =>
    setDrafts(({ [key]: _sent, ...rest }) => rest);

  const { run: send, loading: sending } = useAsyncAction(
    async (req: TurnRequest) => {
      const serverTurns = flow.interview.turns.length;
      const key = req.choice?.field ?? req.field ?? guide.field ?? GOLIVE;
      const edit = await holdPolls(async () => {
        try {
          const res = await api.turn(req);
          if (res.goto) {
            // Named: the site lives at its new address now. The page stays
            // busy until the browser has left for it, signed in there.
            window.location.assign(res.goto);
            await new Promise(() => undefined);
          }
          await slide("next", () => {
            setGuide(res.guide);
            setFlow(res.state);
            setDir("next");
            setAt(null);
            dropDraft(key);
            setPicked(null);
            setFlash(req.selection?.block_id ?? null);
          });
          return res.edit;
        } catch (err) {
          // A slow turn can be cut off by the proxy after the server finished
          // it: adopt the server's transcript instead of losing the answer.
          const fresh = await api.get().catch(() => null);
          if (fresh && fresh.interview.turns.length > serverTurns) {
            await slide("next", () => {
              setFlow(fresh);
              setGuide(fresh.interview.guide);
              setDir("next");
              setAt(null);
              dropDraft(key);
            });
            return null;
          }
          throw err; // the answer is still in its box
        }
      });
      if (edit) await applyEdit(edit);
    },
    { onError: (err) => toast.error(turnErrorText(err)) },
  );

  // A shared bio or CV answers the bio screen like a turn does. Failures
  // throw: the screen shows them in place.
  const shareDoc = (doc: ShareDoc) =>
    holdPolls(async () => {
      const res = await api.importDoc(doc);
      await slide("next", () => {
        setGuide(res.guide);
        setFlow(res.state);
        setDir("next");
        setAt(null);
      });
    });

  // Slides: ← and → move between questions when nothing is being typed.
  useEffect(() => {
    if (golive) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        !(e.target instanceof Element) ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.repeat
      )
        return;
      if (sending || e.target.closest("textarea, input, [contenteditable]"))
        return;
      if (e.key === "ArrowLeft" && index > 0) goBack();
      if (e.key === "ArrowRight" && index < lastIndex) goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [golive, sending, index, lastIndex, goBack, goNext]);

  // Before going live, every built page is looked over and approved: the
  // one on screen, else the next one still to approve.
  const pages = reviewPages(flow.steps, flow.page_builds, iv.pages_ok ?? []);
  const focus = pages.find((p) => p.path === path) ?? nextToReview(pages);
  const reviewing = golive && !!focus && pages.some((p) => !p.ok);
  const { run: approve, loading: approving } = useAsyncAction(
    async (key: string) => {
      const fresh = await holdPolls(() =>
        api.act({ action: "approve", step: `page:${key}` }),
      );
      setFlow(fresh);
      const next = nextToReview(
        reviewPages(
          fresh.steps,
          fresh.page_builds,
          fresh.interview.pages_ok ?? [],
        ),
        key,
      );
      if (next) setPath(next.path);
    },
    { errorToast: "Couldn’t save that. Try again." },
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
      onNavigate={setPath}
      onPick={
        reviewing
          ? (selection, label) => {
              setPicked({ selection, label });
              if (narrow) setTab("guide");
            }
          : undefined
      }
      pickedBlock={picked?.selection.block_id}
      flashBlock={flash}
      busy={
        sending
          ? "Making that change…"
          : undoing
            ? "Undoing that change…"
            : null
      }
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
    const section = Math.min(sectionOf(step?.field), SECTIONS.length - 1);
    const live = index === steps.length - 1;
    const draft =
      drafts[step?.field ?? GOLIVE] ?? preset(step?.field ?? GOLIVE);
    // A building question previews what it builds from every answer so
    // far, the pick on screen included.
    let builder: BuilderData | undefined;
    if (step?.builder) {
      const answers: Record<string, string> = {};
      for (const q of steps)
        if (q.field && q.answer) answers[q.field] = q.answer;
      const now = step.schedule
        ? draft.ticked?.length && draft.schedule
          ? scheduleSummary(
              draft.ticked[0] === "One-time" ? "once" : "recurring",
              draft.schedule,
              locale,
            )
          : undefined
        : draft.ticked?.length
          ? draft.ticked.join(", ")
          : !draft.ticked && !step.answer && step.field?.endsWith("_access")
            ? // The ways in ticked to start with show before she touches them.
              step.prefill_options?.join(", ")
            : draft.text;
      if (step.field && now) answers[step.field] = now;
      const reviewField = `${step.builder}_review`;
      const card = iv.cards?.[reviewField];
      const review = isReview(card) ? card : null;
      const looks = iv.cards?.site_style;
      // The memberships picked so far, with the price and line the guide gave each.
      const picked =
        step.builder === "membership" ? (now ?? "").split(", ") : [];
      builder = {
        answers,
        // The draft itself only once its review has been reached; until
        // then the preview is built from the answers (covers offered early).
        review: steps.some((q) => q.field === reviewField) ? review : null,
        covers: review?.item?.covers ?? [],
        photo:
          looks && !isReview(looks) && !isPhotos(looks)
            ? looks.photos?.[0]
            : undefined,
        tiers: picked
          // The tiles, and any membership of her own she just named.
          .filter((l) => step.options.includes(l) || draft.custom?.includes(l))
          .map((label) => ({
            label,
            // The price she is typing, once it reads as one; a membership
            // she named starts at the own price.
            price: priceOk(draft.prices?.[label] ?? "")
              ? `${step.sign ?? ""}${draft.prices?.[label]?.trim()} a month`
              : (step.hints?.[label] ??
                (step.own_price != null
                  ? `${step.sign ?? ""}${step.own_price} a month`
                  : "")),
            blurb: step.details?.[label] ?? "",
          })),
      };
    }
    // What the question shows beside its words: fresh from the last reply
    // while it is the one being asked, else what the state keeps for it.
    const stepCards = !step
      ? null
      : live
        ? iv.guide.field === step.field
          ? iv.guide.cards
          : step.cards
        : step.field
          ? iv.cards?.[step.field]
          : null;
    return (
      <div className="flex h-full flex-col">
        <header
          style={{ viewTransitionName: "sf-header" }}
          className="flex h-16 shrink-0 items-center gap-1.5 border-b border-[var(--sf-line)] px-3 sm:gap-3 sm:px-6"
        >
          <NavButton
            label="Previous question"
            disabled={index === 0 || sending}
            onClick={goBack}
          >
            <ArrowLeft className="size-4" aria-hidden />
          </NavButton>
          <div className="min-w-0 flex-1 px-1">
            <div className="flex items-baseline justify-between gap-3 text-[12px] text-[var(--sf-faint)]">
              {/* The second of signup's three stages (Account, Your site, Go live). */}
              <span className="hidden truncate font-medium text-[var(--sf-graphite)] sm:inline">
                Your site, step 2 of 3
              </span>
              <span className="shrink-0">
                {SECTIONS[section]?.label} · part {section + 1} of{" "}
                {SECTIONS.length}
              </span>
            </div>
            {/* One segment per section: done, current, still to come. */}
            <div
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={0}
              aria-valuemax={SECTIONS.length}
              aria-valuenow={section}
              className="mt-1.5 flex h-1.5 gap-1"
            >
              {SECTIONS.map((s, i) => (
                <span
                  key={s.label}
                  className={cn(
                    "h-full flex-1 rounded-full transition-colors duration-500",
                    i < section
                      ? "bg-[var(--sf-ink)]"
                      : i === section
                        ? "bg-[var(--sf-brass)]"
                        : "bg-[var(--sf-line)]",
                  )}
                />
              ))}
            </div>
          </div>
          <NavButton
            label="Next question"
            disabled={live || sending}
            onClick={goNext}
          >
            <ArrowRight className="size-4" aria-hidden />
          </NavButton>
          {/* The home page is built while the questions go on: let the coach
              see her own words in a design before the end. */}
          {homeReady && (
            <button
              type="button"
              onClick={() => setPeek(true)}
              className="ml-1 flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--sf-line)] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[var(--sf-ink)] transition-colors hover:border-[var(--sf-line-strong)]"
            >
              <Eye className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Peek at your home page</span>
              <span className="sm:hidden">Peek</span>
            </button>
          )}
          {started && activity && (
            <p
              role="status"
              title={activity}
              className="ml-1 flex max-w-[34vw] items-center gap-2 text-[13px] text-[var(--sf-graphite)]"
            >
              <Spinner size="sm" className="text-[var(--sf-brass)]" />
              {/* On a phone the spinner alone says something is building. */}
              <span className="hidden truncate md:inline">{activity}</span>
              <span className="sr-only md:hidden">{activity}</span>
            </p>
          )}
          <SetupMenu email={email} slug={flow.slug} />
        </header>
        {peek && (
          <ModalPortal>
            <div
              role="dialog"
              aria-modal
              aria-label="Your home page so far"
              style={{
                ...SHELL_TOKENS,
                backgroundColor: "rgb(34 33 31 / 0.6)",
              }}
              className="sf-shell fixed inset-0 z-50 flex flex-col p-3 backdrop-blur-sm motion-safe:animate-fade-in sm:p-6"
              onClick={() => setPeek(false)}
            >
              <div
                className="mx-auto flex w-full max-w-[1400px] shrink-0 items-center justify-between gap-3 pb-3 text-white"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">
                    Your home page so far
                  </p>
                  <p className="text-[13px] text-white/70">
                    It keeps getting better as you answer.
                  </p>
                </div>
                <Button
                  onClick={() => setPeek(false)}
                  className="shrink-0 rounded-full bg-white text-[var(--sf-ink)] hover:bg-white/90"
                >
                  Back to the questions
                </Button>
              </div>
              <div
                className="min-h-0 flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                <BrowserFrame
                  host={host}
                  path="/"
                  device={narrow ? "phone" : "desktop"}
                  reloadKey={0}
                />
              </div>
            </div>
          </ModalPortal>
        )}
        <section
          aria-label="Your setup guide"
          style={{ viewTransitionName: "sf-slide" }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {step?.field === "bio" && (
            <BioScreen
              key={`${index}:${step.field}:${iv.turns.length}`}
              step={step}
              live={live}
              sending={sending}
              onShare={shareDoc}
              onSend={(req) => void send(req)}
              onNext={goNext}
              dir={dir}
            />
          )}
          {step?.field === "site_name" && (
            <NameScreen
              key={`${index}:${step.field}:${iv.turns.length}`}
              step={step}
              host={host}
              live={live}
              sending={sending}
              onSend={(req) => void send(req)}
              onNext={goNext}
              dir={dir}
            />
          )}
          {step && isPhotos(stepCards) && (
            <PhotosScreen
              key={`${index}:${step.field}:${iv.turns.length}`}
              step={step}
              cards={stepCards}
              live={live}
              sending={sending}
              onSend={(req) => void send(req)}
              onNext={goNext}
              dir={dir}
            />
          )}
          {step &&
            !isPhotos(stepCards) &&
            !OPENERS.includes(step.field ?? "") && (
              <QuestionScreen
                key={`${index}:${step.field}:${iv.turns.length}`}
                step={step}
                cards={stepCards}
                brandName={brandName}
                host={host}
                live={live}
                sending={sending}
                draft={draft}
                builder={builder}
                onDraft={editDraft(step.field ?? GOLIVE)}
                onSend={(req) => void send(req)}
                onMoreLogos={api.logos}
                onCover={async (kind, asset) => {
                  await api.cover(kind, asset);
                  await refresh();
                }}
                onTrial={async (kind, on) => {
                  await api.trial(kind, on);
                  await refresh();
                }}
                onNext={goNext}
                dir={dir}
              />
            )}
        </section>
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
          // A full load, never an in-app move: the site's colours, fonts and
          // header are set when a page loads, and the look picked during
          // setup is not the one this page loaded with.
          <Celebration
            brandName={brandName}
            host={host}
            team={celebrate}
            onGo={(href) => window.location.assign(href)}
          />
        )}
      </main>
      <GoLivePanel
        menu={<SetupMenu email={email} slug={flow.slug} />}
        onSeeSite={narrow ? () => setTab("preview") : undefined}
        host={host}
        guide={guide}
        api={api}
        sending={sending}
        activity={activity}
        text={drafts[GOLIVE]?.text ?? ""}
        onText={(update) =>
          editDraft(GOLIVE)((d) => ({ ...d, text: update(d.text ?? "") }))
        }
        onSend={(req) => void send(req)}
        onPublished={(team) => {
          setCelebrate(team);
          // On a phone the hand-off sits on the site's tab.
          setTab("preview");
        }}
        review={
          reviewing && focus
            ? {
                pages,
                focus,
                shown: focus.path === path,
                approving,
                onApprove: () => void approve(focus.key),
                onEdit: () => setEditing(focus),
                onShow: (p) => setPath(p.path),
                picked: picked
                  ? { ...picked, onClear: () => setPicked(null) }
                  : undefined,
              }
            : undefined
        }
        className={cn(
          "lg:w-[440px] lg:shrink-0 lg:border-l lg:border-[var(--sf-line)]",
          narrow && tab !== "guide" ? "hidden" : "flex flex-1 lg:flex-none",
        )}
      />
      {editing && (
        <PageEditor
          path={editing.path}
          label={pageLabel(editing.key)}
          onDone={(to) => {
            setEditing(null);
            // The editor may have moved to another page: the review follows.
            if (pages.some((p) => p.path === to)) setPath(to);
            // The preview is a copy loaded earlier: show the edited page, and
            // pick up anything the editor changed beside it.
            setReloadKey((k) => k + 1);
            void refresh();
          }}
        />
      )}
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
