"use client";

import { useTranslations } from "next-intl";
import { bioIsShort } from "@shared/lib/bio-guide";
import { QuestionHelp } from "./question-help";

/** What to write in a bio box and why: the points to cover, and an example on
 *  demand (the same tap-to-open piece the questions use). Same words as the
 *  signup step, from packages/shared. */
export function BioHints() {
  const t = useTranslations("admin.setupFlow");
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-[var(--sf-graphite)]">
        {t("bio.why")}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i}>{t(`bio.include.${i}` as never)}</li>
        ))}
      </ul>
      <QuestionHelp
        help={{
          term: t("bio.exampleLink"),
          tip: t("bio.example"),
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
  const t = useTranslations("admin.setupFlow");
  if (!bioIsShort(text)) return null;
  return (
    <p
      role="status"
      className="text-[13.5px] leading-relaxed text-[var(--sf-graphite)]"
    >
      {t("bio.nudge")}
    </p>
  );
}
