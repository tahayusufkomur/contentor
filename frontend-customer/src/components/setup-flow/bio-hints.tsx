"use client";

import { BIO_GUIDE, bioIsShort } from "@shared/lib/bio-guide";
import { QuestionHelp } from "./question-help";

/** What to write in a bio box and why: the points to cover, and an example on
 *  demand (the same tap-to-open piece the questions use). Same words as the
 *  signup step, from packages/shared. */
export function BioHints() {
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-[var(--sf-graphite)]">
        {BIO_GUIDE.why}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
        {BIO_GUIDE.includes.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <QuestionHelp
        help={{
          term: BIO_GUIDE.exampleLink,
          tip: BIO_GUIDE.example,
          example: "",
          picture: "",
          sign: "",
        }}
      />
    </div>
  );
}

/** A gentle line under a bio that is still short. Never blocks anything. */
export function BioNudge({ text }: { text: string }) {
  if (!bioIsShort(text)) return null;
  return (
    <p
      role="status"
      className="text-[13.5px] leading-relaxed text-[var(--sf-graphite)]"
    >
      {BIO_GUIDE.nudge}
    </p>
  );
}
