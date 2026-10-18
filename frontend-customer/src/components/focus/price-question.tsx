"use client";

import { useState } from "react";

import type { FocusQuestion } from "@/lib/focus/api";
import type { GuideInput } from "@/lib/focus/guide";

import { GuideQuestion } from "./guide-question";

/** "How will students get it?": Free, a one-time price with its reason, or
 *  one of her memberships. A paid price is only ever her tap (spec F11), so
 *  "You decide" sends nothing: it picks out the suggested tile for her. */
export function PriceQuestion({
  question,
  sending,
  onSend,
}: {
  question: FocusQuestion;
  sending: boolean;
  onSend: (input: GuideInput) => void;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const suggested = question.suggested ?? null;
  return (
    <GuideQuestion
      question={{ ...question, can_delegate: suggested !== null }}
      sending={sending}
      showRest
      onSend={onSend}
      highlighted={highlighted}
      onDelegate={() => setHighlighted(suggested)}
    />
  );
}
