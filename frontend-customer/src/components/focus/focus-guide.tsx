"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { openRunChat } from "@/components/copilot/runs-watcher";
import { SpecialistByline } from "@/components/copilot/specialist-face";
import { AnswerBox } from "@/components/setup-flow/answer-box";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAssistantDock } from "@/lib/assistant-dock";
import { stopRun } from "@/lib/copilot/api";
import { stopActiveTime, takeActiveMs } from "@/lib/focus/active-time";
import {
  answerCreation,
  fetchCreation,
  finishCreation,
  startCreation,
  type FocusQuestion,
  type FocusState,
} from "@/lib/focus/api";
import { guideBody, type GuideInput } from "@/lib/focus/guide";
import {
  refreshFocusOverview,
  setActiveCreation,
  useActiveCreation,
} from "@/lib/focus/store";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

import { GuideQuestion } from "./guide-question";

export const FOCUS_TIME_KEY = "focus:course";
const POLL_MS = 1500;

// The /setup answer box reads the setup shell's tokens; here they are the
// studio's own, so it follows the studio's light and dark.
const SHELL_TOKENS = {
  "--sf-line": "var(--border)",
  "--sf-line-strong": "var(--input)",
  "--sf-faint": "var(--muted-foreground)",
} as CSSProperties;

/** The guide in the dock while she makes something in focus mode: what she
 *  answered so far, then the current question. A tap never waits on a model;
 *  only the outline is written in the background, and the guide waits for it
 *  with Stop at hand. */
export function FocusGuide() {
  const t = useTranslations("admin");
  const state = useActiveCreation();
  const navigate = useNavigate();
  const dock = useAssistantDock();
  // Every state she causes bumps this, so a poll that set out before it
  // cannot put an older state back.
  const version = useRef(0);

  const apply = (next: FocusState | null) => {
    version.current += 1;
    setActiveCreation(next);
  };

  const { run: send, loading: sending } = useAsyncAction(
    async (input: GuideInput) => {
      const current = state;
      const question = current?.question;
      if (!current || !question) return;
      if (current.id === 0) {
        // Her first answer creates the draft course; "Just draft it" here
        // sends her sentence (or leaves the topic to us) and skips the rest.
        const first = guideBody(question, { ...input, rest: false });
        if (!first && !input.rest) return;
        let next = await startCreation({
          kind: current.kind,
          ...(first ?? { delegate: true }),
          active_ms: takeActiveMs(FOCUS_TIME_KEY),
        });
        if (input.rest && next.question)
          next = await answerCreation(next.id, {
            field: next.question.field,
            rest: true,
          });
        apply(next);
        void refreshFocusOverview();
        if (next.record) navigate(`/admin/courses/${next.record.slug}`);
        return;
      }
      const body = guideBody(question, input);
      if (!body) return;
      apply(
        await answerCreation(current.id, {
          ...body,
          active_ms: takeActiveMs(FOCUS_TIME_KEY),
        }),
      );
    },
  );

  const { run: finish, loading: finishing } = useAsyncAction(
    async (publish: boolean) => {
      if (!state) return;
      const next = await finishCreation(state.id, {
        publish,
        active_ms: takeActiveMs(FOCUS_TIME_KEY),
      });
      stopActiveTime(FOCUS_TIME_KEY);
      apply(null);
      void refreshFocusOverview();
      // Focus mode ends: the dock is the normal chat, with the whole exchange.
      if (next.chat !== null)
        openRunChat(next.chat, () => dock.open("assistant"));
      toast.success(t(publish ? "focus.published" : "focus.kept"));
    },
  );

  const { run: stop, loading: stopping } = useAsyncAction(async () => {
    if (!state?.outline.run) return;
    await stopRun(state.outline.run);
    apply(await fetchCreation(state.id));
  });

  const id = state?.id ?? 0;
  const building = state?.outline.status === "building";
  useEffect(() => {
    if (!id || !building) return;
    const timer = setInterval(() => {
      const at = version.current;
      fetchCreation(id)
        .then((next) => {
          if (version.current === at) setActiveCreation(next);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [id, building]);

  if (!state) return null;
  const question = state.question;

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
      {question &&
        (question.kind === "review" ? (
          <OutlineReview
            question={question}
            status={state.outline.status}
            sending={sending}
            stopping={stopping}
            onSend={send}
            onStop={stop}
          />
        ) : question.kind === "finish" ? (
          <FinishStep
            question={question}
            finishing={finishing}
            onFinish={finish}
          />
        ) : (
          <GuideQuestion
            key={question.field}
            question={question}
            sending={sending}
            showRest
            onSend={send}
          />
        ))}
    </div>
  );
}

const NONE: GuideInput = {
  picked: null,
  text: "",
  delegate: false,
  rest: false,
};

function OutlineReview({
  question,
  status,
  sending,
  stopping,
  onSend,
  onStop,
}: {
  question: FocusQuestion;
  status: FocusState["outline"]["status"];
  sending: boolean;
  stopping: boolean;
  onSend: (input: GuideInput) => void;
  onStop: () => void;
}) {
  const t = useTranslations("admin");
  const [text, setText] = useState("");

  if (status === "building")
    return (
      <div className="flex flex-col gap-3">
        <SpecialistByline k={question.specialist} />
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Spinner size="sm" />
          {t("focus.writingOutline")}
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
          {failed ? t("focus.outlineFailed") : question.question}
        </h2>
        {!failed && question.why && (
          <p className="mt-1 text-sm text-muted-foreground">{question.why}</p>
        )}
      </div>
      <div>
        <Button
          loading={sending}
          onClick={() => onSend({ ...NONE, picked: failed ? "retry" : "ok" })}
        >
          {t(failed ? "focus.tryAgain" : "focus.looksGood")}
        </Button>
      </div>
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
    </div>
  );
}

function FinishStep({
  question,
  finishing,
  onFinish,
}: {
  question: FocusQuestion;
  finishing: boolean;
  onFinish: (publish: boolean) => void;
}) {
  const t = useTranslations("admin");
  const [choice, setChoice] = useState<boolean | null>(null);
  const pick = (publish: boolean) => {
    setChoice(publish);
    onFinish(publish);
  };
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
        <Button
          loading={finishing && choice === true}
          disabled={finishing}
          onClick={() => pick(true)}
        >
          {t("focus.publishNow")}
        </Button>
        <Button
          variant="outline"
          loading={finishing && choice === false}
          disabled={finishing}
          onClick={() => pick(false)}
        >
          {t("focus.keepDraft")}
        </Button>
      </div>
    </div>
  );
}
