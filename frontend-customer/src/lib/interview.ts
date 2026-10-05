// Pure helpers for the /setup interview (no runtime imports: unit-tested in isolation).
import type { GuideTurn, InterviewEntry } from "@/lib/setup-flow";

/** Append a dictated phrase to what is already in the box. */
export function joinSpeech(base: string, phrase: string): string {
  const p = phrase.trim();
  if (!p) return base;
  const b = base.trimEnd();
  return b ? `${b} ${p}` : p;
}

type Builds = Record<string, { status: string } | undefined>;

/** The page whose build just finished between two polls, if any. */
export function landedPage(prev: Builds, next: Builds): string | null {
  return (
    Object.keys(next).find(
      (k) => next[k]?.status === "ready" && prev[k]?.status !== "ready",
    ) ?? null
  );
}

/** A guide turn as it is kept in the transcript (cards are re-fetched fresh). */
export function toEntry(guide: GuideTurn): InterviewEntry {
  const { cards: _cards, ...rest } = guide;
  return { role: "guide", ...rest };
}

/** A short status line from the guide (e.g. an applied change). */
export function noteEntry(text: string, auditId?: number): InterviewEntry {
  return {
    role: "guide",
    ack: text,
    question: "",
    options: [],
    field: null,
    can_delegate: false,
    ...(auditId != null ? { audit_id: auditId } : {}),
  };
}

export function formatPrice(cents: number | null, currency: string): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
