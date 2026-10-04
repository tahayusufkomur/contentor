"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ContentKind } from "@/lib/setup-flow";

const COPY: Record<
  ContentKind,
  { question: string; help: string; placeholder: string }
> = {
  course: {
    question: "What’s your first course about?",
    help: "Describe it the way you’d tell a friend. You’ll get a full draft with an outline, lessons, a description and a price, all editable.",
    placeholder:
      "A gentle 4-week program for beginners who sit at a desk all day",
  },
  event: {
    question: "What’s your first live class?",
    help: "Say what you’ll teach and who it’s for. You’ll get a draft with a date, a time and a description you can change.",
    placeholder: "A 45-minute Sunday slow flow for tired backs",
  },
  post: {
    question: "What should your first article be about?",
    help: "One idea is enough. You’ll get a full draft with a cover photo, ready to polish.",
    placeholder: "Three habits that made my morning practice stick",
  },
};

/** The stage for a content step with no draft yet: one friendly question. */
export function ContentQuestion({
  kind,
  suggestions,
  drafting,
  onDraft,
  onKeepCurrent,
}: {
  kind: ContentKind;
  suggestions: string[];
  drafting: boolean;
  onDraft: (prompt: string) => void;
  /** Shown when the coach chose to start over but a draft exists. */
  onKeepCurrent?: () => void;
}) {
  const copy = COPY[kind];
  const [text, setText] = useState("");
  const id = `setup-${kind}-prompt`;

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-5 py-8">
      <form
        className="w-full max-w-[560px] motion-safe:animate-[sf-rise_.45s_ease-out_both]"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onDraft(text.trim());
        }}
      >
        <label
          htmlFor={id}
          className="block text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[34px]"
        >
          {copy.question}
        </label>
        <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-[var(--sf-graphite)]">
          {copy.help}
        </p>
        <Textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (text.trim()) onDraft(text.trim());
            }
          }}
          placeholder={copy.placeholder}
          rows={4}
          maxLength={600}
          className="mt-6 resize-none rounded-xl border-[var(--sf-line-strong)] bg-white px-4 py-3 text-[15px] leading-relaxed shadow-[0_1px_2px_rgb(20_22_28/0.04)] focus-visible:ring-[3px] focus-visible:ring-[rgb(154_119_58/0.3)] focus-visible:ring-offset-0"
        />
        {suggestions.length > 0 && (
          <div className="mt-4">
            <p className="text-[13px] text-[var(--sf-faint)]">
              Or start from an idea
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setText(s)}
                  className="rounded-full border border-[var(--sf-line)] bg-white px-3.5 py-1.5 text-left text-[13px] text-[var(--sf-ink)] transition-colors hover:border-[var(--sf-line-strong)] hover:bg-[var(--sf-tint)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            size="lg"
            disabled={!text.trim()}
            loading={drafting}
            loadingText="Drafting…"
            className="rounded-full px-7"
          >
            Draft it for me
          </Button>
          {onKeepCurrent && (
            <Button
              type="button"
              variant="ghost"
              onClick={onKeepCurrent}
              className="rounded-full"
            >
              Keep the current draft
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
