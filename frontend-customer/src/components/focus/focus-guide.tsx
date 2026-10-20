"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { openRunChat } from "@/components/copilot/runs-watcher";
import {
  SpecialistByline,
  SpecialistFace,
} from "@/components/copilot/specialist-face";
import { AnswerBox } from "@/components/setup-flow/answer-box";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NavLink } from "@/components/ui/nav-link";
import { Spinner } from "@/components/ui/spinner";
import { useAssistantDock } from "@/lib/assistant-dock";
import { stopRun } from "@/lib/copilot/api";
import type { SpecialistKey } from "@/lib/copilot/team";
import { stopActiveTime, takeActiveMs } from "@/lib/focus/active-time";
import {
  announceCreation,
  answerCreation,
  coverAction,
  fetchCreation,
  finishCreation,
  leaveCreation,
  retryDescriptions,
  startCreation,
  type FocusAnnouncement,
  type FocusQuestion,
  type FocusState,
} from "@/lib/focus/api";
import { guideBody, type GuideInput } from "@/lib/focus/guide";
import { focusTimeKey, type FocusKind } from "@/lib/focus/kinds";
import {
  activeCreation,
  applyCreation as apply,
  creationVersion,
  morePhotos,
  refreshFocusOverview,
  saveFocusEdits,
  setActiveCreation,
  useActiveCreation,
  useCanMorePhotos,
  useCoverPick,
} from "@/lib/focus/store";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

import { GuideQuestion } from "./guide-question";
import { PickQuestion } from "./pick-question";
import { PriceQuestion } from "./price-question";
import { ScheduleQuestion } from "./schedule-question";
import { UploadQuestion } from "./upload-question";

const POLL_MS = 1500;
// The kinds whose page edits are saved before her finish taps go out.
const SAVE_FIRST: FocusKind[] = ["message", "membership", "bundle"];

// The /setup answer box reads the setup shell's tokens; here they are the
// studio's own, so it follows the studio's light and dark.
const SHELL_TOKENS = {
  "--sf-line": "var(--border)",
  "--sf-line-strong": "var(--input)",
  "--sf-faint": "var(--muted-foreground)",
} as CSSProperties;

/** The guide in the dock while she makes something in focus mode: what she
 *  answered so far, then the current question. A tap never waits on a model;
 *  only her typed words are read and the outline is written in the
 *  background, and the guide waits for them with Stop at hand. */
export function FocusGuide() {
  const t = useTranslations("admin");
  const state = useActiveCreation();
  const navigate = useNavigate();
  const dock = useAssistantDock();
  const timeKey = focusTimeKey(state?.kind ?? "course");

  const { run: send, loading: sending } = useAsyncAction(
    async (input: GuideInput) => {
      const current = state;
      const question = current?.question;
      if (!current || !question) return;
      const body = guideBody(question, input);
      if (!body) return;
      if (current.id === 0) {
        // Her first answer creates the draft; "Just draft it" here
        // drafts the rest in the same request (the topic too, when the box
        // is empty).
        const next = await startCreation({
          kind: current.kind,
          ...body,
          active_ms: takeActiveMs(timeKey),
        });
        void refreshFocusOverview();
        if (apply(0, next) && next.record) navigate(next.record.path);
        return;
      }
      // "Sell it for": a price she typed on the page is saved first, and stands.
      if (question.kind === "finish" && SAVE_FIRST.includes(current.kind))
        await saveFocusEdits();
      apply(
        current.id,
        await answerCreation(current.id, {
          ...body,
          active_ms: takeActiveMs(timeKey),
        }),
      );
    },
  );

  const { run: finish, loading: finishing } = useAsyncAction(
    async (publish: boolean, startSelling: boolean, announce: boolean) => {
      if (!state) return;
      // What she typed a moment ago is what goes out (the composer saves a
      // beat later; a membership's page saves only on leaving).
      if (SAVE_FIRST.includes(state.kind)) await saveFocusEdits();
      const next = await finishCreation(state.id, {
        publish,
        announce,
        active_ms: takeActiveMs(timeKey),
      });
      // A membership or bundle says what its tap did ("On sale. …", "Saved as a draft. …").
      const own =
        state.kind === "membership" || state.kind === "bundle"
          ? next.closing
          : undefined;
      // Live, with "Tell my students": Marketing's draft is the last step.
      if (next.status === "active" && next.question?.kind === "announce") {
        apply(state.id, next);
        toast.success(own ?? t("focus.published"));
        return;
      }
      stopActiveTime(timeKey);
      apply(state.id, null);
      void refreshFocusOverview();
      if (next.status !== "done") return; // its course was deleted meanwhile
      // "Start selling": it stays a draft, and she goes on to her plan, then payouts.
      if (startSelling)
        navigate(
          state.question?.paid_active ? "/admin/payouts" : "/admin/billing",
        );
      // Focus mode ends: the dock is the normal chat, with the whole exchange.
      if (next.chat !== null)
        openRunChat(next.chat, () => dock.open("assistant"));
      toast.success(
        // A message's own line: "Sent.", or when it is scheduled for.
        publish && state.kind === "message" && next.closing
          ? next.closing
          : (own ?? t(publish ? "focus.published" : "focus.kept")),
      );
    },
  );

  // Schedule or Not now on Marketing's draft: focus mode ends, as on finish.
  const { run: decide, loading: deciding } = useAsyncAction(
    async (schedule: boolean) => {
      if (!state) return;
      const next = await announceCreation(state.id, {
        schedule,
        active_ms: takeActiveMs(timeKey),
      });
      if (next.status === "active") {
        apply(state.id, next); // a stale screen: the step as it is now
        return;
      }
      stopActiveTime(timeKey);
      apply(state.id, null);
      void refreshFocusOverview();
      if (next.status === "done" && next.chat !== null)
        openRunChat(next.chat, () => dock.open("assistant"));
    },
  );

  const { run: retryAnnouncement, loading: retryingAnnouncement } =
    useAsyncAction(async () => {
      if (!state) return;
      apply(state.id, await announceCreation(state.id, { retry: true }));
    });

  const { run: stop, loading: stopping } = useAsyncAction(async () => {
    if (!state?.outline.run) return;
    await stopRun(state.outline.run);
    apply(state.id, await fetchCreation(state.id));
  });

  const { run: stopReading, loading: stoppingReading } = useAsyncAction(
    async () => {
      if (!state?.reading?.run) return;
      await stopRun(state.reading.run);
      apply(state.id, await fetchCreation(state.id));
    },
  );

  // A stopped follow-up: the flow goes on without it.
  const { run: stopThinking, loading: stoppingThinking } = useAsyncAction(
    async () => {
      if (!state?.thinking?.run) return;
      await stopRun(state.thinking.run);
      apply(state.id, await fetchCreation(state.id));
    },
  );

  const { run: retryWriting, loading: retrying } = useAsyncAction(async () => {
    if (!state) return;
    apply(state.id, await retryDescriptions(state.id));
  });

  // "Fill it in myself": focus mode ends for good and she stays on the page,
  // which is the plain editor from here; an outline being written is dropped.
  const { run: fillMyself, loading: leaving } = useAsyncAction(async () => {
    if (!state?.id) return;
    await leaveCreation(state.id, {
      abandon: true,
      active_ms: takeActiveMs(timeKey),
    });
    stopActiveTime(timeKey);
    apply(state.id, null);
    void refreshFocusOverview();
  });

  const id = state?.id ?? 0;
  const building = [
    state?.outline,
    state?.reading,
    state?.thinking,
    state?.descriptions,
    state?.copy,
    state?.cover,
    state?.announcement,
  ].some((job) => job?.status === "building");
  useEffect(() => {
    if (!id || !building) return;
    const timer = setInterval(() => {
      const at = creationVersion();
      fetchCreation(id)
        .then((next) => {
          if (creationVersion() === at && activeCreation()?.id === id)
            setActiveCreation(next);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [id, building]);

  if (!state) return null;
  const question = state.question;
  const descriptions = state.descriptions?.status;
  // Another specialist takes this step: who, in one line (spec §4.1).
  const handOver =
    question && HAND_OVER[question.field] === question.specialist;
  // The review's drafting: the course's outline, every other kind's copy job
  // (its title and description), which leaves the page whole even when it fails.
  const copy = state.kind !== "course";
  // The blog writer's gate said no: the review says why and offers Write it myself.
  const refused =
    question?.kind === "review" && state.copy?.status === "failed"
      ? state.copy.reason
      : undefined;

  return (
    <div className="flex flex-col gap-5" style={SHELL_TOKENS}>
      {state.answered.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {state.answered.map((line) => (
            <li
              key={line.field}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">{line.label}</span>
            </li>
          ))}
        </ul>
      )}
      {descriptions === "building" && (
        <p className="text-sm text-muted-foreground">
          {t("focus.descriptionsNote")}
        </p>
      )}
      {descriptions === "failed" && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            {t("focus.descriptionsFailed")}
          </p>
          <Button
            size="sm"
            variant="outline"
            loading={retrying}
            onClick={retryWriting}
          >
            {t("focus.tryAgain")}
          </Button>
        </div>
      )}
      {state.reading?.status === "building" && (
        <div className="flex flex-col gap-3">
          <SpecialistByline k="content" />
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Spinner size="sm" />
            {t("focus.readingDetails")}
          </p>
          <div>
            <Button
              size="sm"
              variant="outline"
              loading={stoppingReading}
              onClick={stopReading}
            >
              {t("focus.stop")}
            </Button>
          </div>
        </div>
      )}
      {state.thinking?.status === "building" && (
        <div className="flex flex-col gap-3">
          <SpecialistByline k={state.thinking.specialist} />
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Spinner size="sm" />
            {t(
              t.has(`focus.kinds.${state.kind}.thinking`)
                ? `focus.kinds.${state.kind}.thinking`
                : "focus.thinking",
            )}
          </p>
          <div>
            <Button
              size="sm"
              variant="outline"
              loading={stoppingThinking}
              onClick={stopThinking}
            >
              {t("focus.stop")}
            </Button>
          </div>
        </div>
      )}
      {question && handOver && (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <SpecialistFace k={question.specialist} size="sm" />
          {t(
            // A kind's own words for the step (a membership's price), else the shared ones.
            t.has(`focus.kinds.${state.kind}.handOver.${question.field}`)
              ? `focus.kinds.${state.kind}.handOver.${question.field}`
              : `focus.handOver.${question.field}`,
            { name: t(`team.specialists.${question.specialist}.name`) },
          )}
        </p>
      )}
      {question &&
        (question.kind === "review" ? (
          <OutlineReview
            kind={state.kind}
            question={question}
            status={
              copy ? (state.copy?.status ?? "ready") : state.outline.status
            }
            drafted={copy || state.outline.drafted}
            copy={copy}
            refused={refused}
            sending={sending}
            stopping={stopping}
            leaving={leaving}
            onSend={send}
            onStop={stop}
            onFillMyself={fillMyself}
          />
        ) : question.kind === "cover" ? (
          <CoverQuestion
            question={question}
            state={state}
            sending={sending}
            onSend={send}
          />
        ) : question.kind === "finish" ? (
          <FinishStep
            key={state.id}
            kind={state.kind}
            question={question}
            finishing={finishing}
            sending={sending}
            onFinish={finish}
            onSend={send}
          />
        ) : question.kind === "announce" ? (
          <AnnounceStep
            question={question}
            announcement={state.announcement}
            deciding={deciding}
            retrying={retryingAnnouncement}
            onDecide={decide}
            onRetry={retryAnnouncement}
          />
        ) : question.kind === "schedule" ? (
          <GuideQuestion
            key={question.field}
            question={question}
            sending={sending}
            showRest
            onSend={send}
          >
            <ScheduleQuestion
              timezone={question.timezone}
              sending={sending}
              onAnswer={(json) => send({ ...NONE, picked: json })}
            />
          </GuideQuestion>
        ) : question.kind === "upload" ? (
          <GuideQuestion
            key={question.field}
            question={question}
            sending={sending}
            showRest={false}
            onSend={send}
          >
            {state.record && (
              <UploadQuestion
                downloadId={state.record.id}
                onDone={() => send({ ...NONE, picked: "uploaded" })}
              />
            )}
          </GuideQuestion>
        ) : question.kind === "pick" &&
          question.options.length < 2 &&
          t.has(`focus.kinds.${state.kind}.tooFew`) ? (
          // Too little to pick from for this kind (a bundle needs two items she
          // sells): one plain line, never an empty pick. The way forward is the
          // page's "Fill it in myself" (or the button below, once started).
          <p className="text-sm text-foreground">
            {t(`focus.kinds.${state.kind}.tooFew`)}
          </p>
        ) : question.kind === "pick" ? (
          // Her ticks are the answer: the tiles live in PickQuestion, not as taps.
          <GuideQuestion
            key={`${question.field}:${(question.ticked ?? []).join(",")}`}
            question={{ ...question, options: [] }}
            sending={sending}
            showRest={false}
            onSend={send}
          >
            <PickQuestion
              options={question.options}
              ticked={question.ticked}
              selectAll="all"
              sending={sending}
              onAnswer={(value) => send({ ...NONE, picked: value })}
            />
          </GuideQuestion>
        ) : question.kind === "price" ? (
          <PriceQuestion
            key={question.field}
            question={question}
            sending={sending}
            onSend={send}
          />
        ) : (
          <GuideQuestion
            key={question.field}
            question={question}
            sending={sending}
            showRest={
              // Not on a first question only she can answer (a message's topic).
              question.field !== "clarify" &&
              (state.id !== 0 || question.can_delegate)
            }
            onSend={send}
          />
        ))}
      {state.id !== 0 && !refused && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start text-muted-foreground"
          loading={leaving}
          onClick={fillMyself}
        >
          {t(`focus.kinds.${state.kind}.fillMyself`)}
        </Button>
      )}
    </div>
  );
}

/** The steps another specialist takes over, each with its line under
 *  `focus.handOver`; only that specialist says it (a finish that is not
 *  ready yet is asked by the Content Creating Specialist instead). */
const HAND_OVER: Partial<Record<string, SpecialistKey>> = {
  cover: "designer",
  access: "finance",
  finish: "marketing",
};

const NONE: GuideInput = {
  picked: null,
  text: "",
  delegate: false,
  rest: false,
};

function OutlineReview({
  kind,
  question,
  status,
  drafted,
  copy,
  refused,
  sending,
  stopping,
  leaving,
  onSend,
  onStop,
  onFillMyself,
}: {
  kind: FocusKind;
  question: FocusQuestion;
  status: FocusState["outline"]["status"];
  drafted: boolean;
  /** The copy job's title and description, not an outline. */
  copy: boolean;
  /** Why the drafting was refused (a post's blog gate): never Try again. */
  refused?: NonNullable<FocusState["copy"]>["reason"];
  sending: boolean;
  stopping: boolean;
  leaving: boolean;
  onSend: (input: GuideInput) => void;
  onStop: () => void;
  onFillMyself: () => void;
}) {
  const t = useTranslations("admin");
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<"ok" | "retry" | null>(null);
  const pick = (value: "ok" | "retry") => {
    setChoice(value);
    onSend({ ...NONE, picked: value });
  };

  if (status === "building")
    return (
      <div className="flex flex-col gap-3">
        <SpecialistByline k={question.specialist} />
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Spinner size="sm" />
          {t(
            t.has(`focus.kinds.${kind}.writing`)
              ? `focus.kinds.${kind}.writing`
              : copy
                ? "focus.writingCopy"
                : "focus.writingOutline",
          )}
        </p>
        <div>
          <Button
            size="sm"
            variant="outline"
            loading={stopping}
            onClick={onStop}
          >
            {t("focus.stop")}
          </Button>
        </div>
      </div>
    );

  const failed = status !== "ready";
  return (
    <div className="flex flex-col gap-4">
      <SpecialistByline k={question.specialist} />
      <div>
        <h2 className="text-lg font-semibold leading-snug text-foreground">
          {refused
            ? t(`focus.kinds.${kind}.refused.${refused}`)
            : failed
              ? t(copy ? "focus.copyFailed" : "focus.outlineFailed")
              : question.question}
        </h2>
        {!failed && question.why && (
          <p className="mt-1 text-sm text-muted-foreground">{question.why}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Her earlier outline is still on the page after a failed redraft: she can go on with it. */}
        {(!failed || drafted) && (
          <Button
            loading={sending && choice === "ok"}
            disabled={sending}
            onClick={() => pick("ok")}
          >
            {t("focus.looksGood")}
          </Button>
        )}
        {failed && !refused && (
          <Button
            variant={drafted ? "outline" : "default"}
            loading={sending && choice === "retry"}
            disabled={sending}
            onClick={() => pick("retry")}
          >
            {t("focus.tryAgain")}
          </Button>
        )}
        {refused && (
          <Button variant="outline" loading={leaving} onClick={onFillMyself}>
            {t(`focus.kinds.${kind}.fillMyself`)}
          </Button>
        )}
        {(refused === "upgrade_required" || refused === "quota_exhausted") && (
          <Button asChild variant="outline">
            <NavLink href="/admin/billing">{t("blog.upgrade")}</NavLink>
          </Button>
        )}
      </div>
      {/* Her words would ask the refused writer again: she edits the page instead. */}
      {!refused && (
        <AnswerBox
          value={text}
          onChange={(update) => setText(update)}
          sending={sending}
          onSubmit={(value) => {
            onSend({ ...NONE, text: value });
            setText("");
          }}
          placeholder={t("focus.changePlaceholder")}
          className="bg-background"
        />
      )}
    </div>
  );
}

type CoverTap = "keep" | "edit" | "more" | "later";

/** The cover step's question: the four drafts are on the page (CoverStep),
 *  and here she keeps the one she picked there, asks for four more, edits it
 *  in the photo studio, leaves it for later, or says what photo she wants. */
function CoverQuestion({
  question,
  state,
  sending,
  onSend,
}: {
  question: FocusQuestion;
  state: FocusState;
  sending: boolean;
  onSend: (input: GuideInput) => void;
}) {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const pick = useCoverPick();
  const canMorePhotos = useCanMorePhotos();
  const [text, setText] = useState("");
  const [tapped, setTapped] = useState<CoverTap | null>(null);
  const { run: tap, loading } = useAsyncAction(async (action: CoverTap) => {
    setTapped(action);
    const next = await coverAction(
      state.id,
      action === "keep" || action === "edit"
        ? { action, index: pick ?? 0 }
        : { action },
    );
    if (!apply(state.id, next) || action !== "edit" || !next.design_id) return;
    // An event's page has a query of its own: its "&" must stay inside back=.
    const back = (state.record?.path ?? "").replaceAll("&", "%26");
    navigate(`/admin/studio/${next.design_id}?back=${back}`);
  });
  const busy = loading || sending;
  const button = (
    action: CoverTap,
    label: string,
    variant: "default" | "outline" | "ghost" = "outline",
    enabled = true,
  ) => (
    <Button
      size="sm"
      variant={variant}
      loading={loading && tapped === action}
      disabled={busy || !enabled}
      onClick={() => tap(action)}
    >
      {t(label)}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <SpecialistByline k={question.specialist} />
      <div>
        <h2 className="text-lg font-semibold leading-snug text-foreground">
          {question.question}
        </h2>
        {question.why && (
          <p className="mt-1 text-sm text-muted-foreground">{question.why}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {button("keep", "focus.useCover", "default", pick !== null)}
        {/* Also the way forward when no drafts came: it starts a round. */}
        {button(
          "more",
          // No round yet (the copy failed, so none was drafted ahead): this starts one.
          state.cover ? "focus.moreStyles" : "focus.draftCovers",
          "outline",
          state.cover?.status !== "building",
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!canMorePhotos}
          onClick={morePhotos}
        >
          {t("focus.morePhotos")}
        </Button>
        {button("edit", "focus.editCover", "outline", pick !== null)}
        {button("later", "focus.later", "ghost")}
      </div>
      <AnswerBox
        value={text}
        onChange={(update) => setText(update)}
        sending={sending}
        onSubmit={(value) => {
          onSend({ ...NONE, text: value });
          setText("");
        }}
        placeholder={t("focus.coverPlaceholder")}
        className="bg-background"
      />
    </div>
  );
}

function FinishStep({
  kind,
  question,
  finishing,
  sending,
  onFinish,
  onSend,
}: {
  kind: FocusKind;
  question: FocusQuestion;
  finishing: boolean;
  sending: boolean;
  onFinish: (
    publish: boolean,
    startSelling: boolean,
    announce: boolean,
  ) => void;
  /** "Sell it for": the price "Just draft it" left to her, set by her tap. */
  onSend: (input: GuideInput) => void;
}) {
  const t = useTranslations("admin");
  const [choice, setChoice] = useState<string | null>(null);
  // A message's tick is "Also by email", off unless she asked for it (never
  // email she did not ask for); the course's and the event's is "Tell my
  // students", on.
  const [tell, setTell] = useState(question.tick ?? kind !== "message");
  // The kind's own two (backend FINISH): go live first, keep last. Go live is
  // left out while it is not ready, or while "Start selling" stands in for it.
  const own = question.options.filter(
    (o) => o.value !== "start_selling" && !o.value.startsWith("price:"),
  );
  const live = own.length > 1 ? own[0] : undefined;
  const keep = own[own.length - 1];
  const pick = (value: string) => {
    setChoice(value);
    const publish = value === live?.value;
    // A message's tick is kept on its draft too; "Tell my students" only goes with going live.
    onFinish(
      publish,
      value === "start_selling",
      (publish || kind === "message") && tell,
    );
  };
  const has = (value: string) =>
    question.options.some((o) => o.value === value);
  const sell = question.options.find((o) => o.value.startsWith("price:"));
  const busy = finishing || sending;
  return (
    <div className="flex flex-col gap-4">
      <SpecialistByline k={question.specialist} />
      <div>
        <h2 className="text-lg font-semibold leading-snug text-foreground">
          {question.question}
        </h2>
        {question.why && (
          <p className="mt-1 text-sm text-muted-foreground">{question.why}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {/* Offered only once it is ready (every lesson has a video or text). */}
        {live && (
          <>
            <Button
              loading={finishing && choice === live.value}
              disabled={busy}
              onClick={() => pick(live.value)}
            >
              {live.label}
            </Button>
            {/* Marketing drafts an announcement once it is live; a message also goes by email. */}
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={tell}
                disabled={busy}
                onCheckedChange={(value) => setTell(value === true)}
              />
              {t(
                kind === "message"
                  ? "focus.kinds.message.tick"
                  : "focus.tellStudents",
              )}
            </label>
          </>
        )}
        {/* A paid course she cannot sell yet: her plan, then payouts. */}
        {has("start_selling") && (
          <Button
            loading={finishing && choice === "start_selling"}
            disabled={busy}
            onClick={() => pick("start_selling")}
          >
            {t("focus.startSelling")}
          </Button>
        )}
        {keep && (
          <Button
            variant="outline"
            loading={finishing && choice === keep.value}
            disabled={busy}
            onClick={() => pick(keep.value)}
          >
            {keep.label}
          </Button>
        )}
      </div>
      {sell && (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="outline"
            loading={sending}
            disabled={busy}
            onClick={() => onSend({ ...NONE, picked: sell.value })}
          >
            {sell.label}
          </Button>
          {sell.hint && (
            <p className="text-xs text-muted-foreground">{sell.hint}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Marketing's announcement, once the course is live: the draft and when it
 *  would go out, with Schedule and Not now. Both end focus mode. */
function AnnounceStep({
  question,
  announcement,
  deciding,
  retrying,
  onDecide,
  onRetry,
}: {
  question: FocusQuestion;
  announcement: FocusAnnouncement | null;
  deciding: boolean;
  retrying: boolean;
  onDecide: (schedule: boolean) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("admin");
  const [choice, setChoice] = useState<boolean | null>(null);
  const decide = (schedule: boolean) => {
    setChoice(schedule);
    onDecide(schedule);
  };
  const status = announcement?.status ?? "building";
  const busy = deciding || retrying;
  const notNow = (
    <Button
      variant="outline"
      loading={deciding && choice === false}
      disabled={busy}
      onClick={() => decide(false)}
    >
      {t("focus.notNow")}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <SpecialistByline k={question.specialist} />
      <h2 className="text-lg font-semibold leading-snug text-foreground">
        {question.question}
      </h2>
      {status === "building" || status === "idle" ? (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Spinner size="sm" />
          {t("focus.writingAnnouncement")}
        </p>
      ) : status === "failed" || !announcement ? (
        <p className="text-sm text-muted-foreground">
          {t("focus.announcementFailed")}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
          <p className="font-medium text-foreground">{announcement.title}</p>
          <p className="whitespace-pre-line text-sm text-foreground">
            {announcement.body}
          </p>
          {announcement.send_at && (
            <p className="text-xs text-muted-foreground">
              {t("focus.sendsAt", {
                when: new Date(announcement.send_at).toLocaleString(undefined, {
                  dateStyle: "full",
                  timeStyle: "short",
                  timeZone: announcement.zone ?? undefined,
                }),
              })}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status === "ready" && (
          <Button
            loading={deciding && choice === true}
            disabled={busy}
            onClick={() => decide(true)}
          >
            {t("focus.schedule")}
          </Button>
        )}
        {status === "failed" && (
          <Button
            variant="outline"
            loading={retrying}
            disabled={busy}
            onClick={onRetry}
          >
            {t("focus.tryAgain")}
          </Button>
        )}
        {notNow}
      </div>
    </div>
  );
}
