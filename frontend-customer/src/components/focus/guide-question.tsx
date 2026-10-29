"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { SpecialistByline } from "@/components/copilot/specialist-face";
import { AnswerBox } from "@/components/setup-flow/answer-box";
import { Button } from "@/components/ui/button";
import type { FocusQuestion } from "@/lib/focus/api";
import { type GuideInput, showsStarters } from "@/lib/focus/guide";

const NONE: GuideInput = {
  picked: null,
  text: "",
  delegate: false,
  rest: false,
};

/** One of the recipe's questions in the dock: the specialist asking, the
 *  question and why it matters, tap answers, "You decide", "Just draft it"
 *  and the answer box. A tap sends at once. Key it by field: her typing
 *  belongs to the question it was typed for. */
export function GuideQuestion({
  question,
  sending,
  showRest,
  onSend,
  highlighted = null,
  onDelegate,
  children,
}: {
  question: FocusQuestion;
  sending: boolean;
  /** "Just draft it" (the questions before the outline). */
  showRest: boolean;
  onSend: (input: GuideInput) => void;
  /** The tile picked out for her to tap (the price step's "You decide"). */
  highlighted?: string | null;
  /** "You decide" handled here instead of sent. */
  onDelegate?: () => void;
  /** Its own answer, under the question (the schedule picker). */
  children?: ReactNode;
}) {
  const t = useTranslations("admin");
  const [text, setText] = useState("");
  // Into the answer box, the cursor after what is there.
  const toBox = () =>
    requestAnimationFrame(() => {
      const box = document.getElementById(
        "setup-answer",
      ) as HTMLTextAreaElement | null;
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    });

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
      {children}
      {question.options.length > 0 && (
        <div className="grid gap-2">
          {question.options.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={sending}
              onClick={() => onSend({ ...NONE, picked: option.value })}
              data-highlighted={option.value === highlighted || undefined}
              className="rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent disabled:opacity-60 data-[highlighted]:border-primary data-[highlighted]:ring-2 data-[highlighted]:ring-primary/30"
            >
              <span className="block text-sm font-medium text-foreground">
                {option.label}
              </span>
              {option.hint && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {option.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {showsStarters(question) &&
        question.starter != null &&
        !text &&
        [
          // A kind's format tiles first, then "My own idea…"; the course's own starter alone.
          ...(question.starters ?? []),
          {
            label: question.starters?.length
              ? t("focus.ownIdea")
              : `${question.starter.trim()}…`,
            starter: question.starter,
          },
        ].map(({ label, starter }) => (
          <button
            key={starter}
            type="button"
            disabled={sending}
            onClick={() => {
              setText(starter);
              toBox(); // her sentence goes on from the starter
            }}
            className="rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-accent"
          >
            {label}
          </button>
        ))}
      {/* Not a tile: a tile would answer with no amount. She types hers. */}
      {question.say && (
        <button
          type="button"
          disabled={sending}
          onClick={toBox}
          className="rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-accent"
        >
          {question.say}
        </button>
      )}
      {(question.can_delegate || showRest) && (
        <div className="flex flex-wrap gap-2">
          {question.can_delegate && (
            <Button
              size="sm"
              variant="outline"
              disabled={sending}
              onClick={() =>
                onDelegate ? onDelegate() : onSend({ ...NONE, delegate: true })
              }
            >
              {t("focus.youDecide")}
            </Button>
          )}
          {showRest && (
            <Button
              size="sm"
              variant="ghost"
              disabled={sending}
              onClick={() => onSend({ ...NONE, rest: true, text })}
            >
              {t("focus.justDraft")}
            </Button>
          )}
        </div>
      )}
      <AnswerBox
        value={text}
        onChange={(update) => setText(update)}
        sending={sending}
        onSubmit={(value) => onSend({ ...NONE, text: value })}
        placeholder={t("focus.answerPlaceholder")}
        className="bg-background"
      />
    </div>
  );
}
