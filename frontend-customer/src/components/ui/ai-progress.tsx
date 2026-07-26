"use client";

// Progress panel for the long structured-AI calls (blog drafts, logo
// designs). Those calls run 45s+; a bare spinner for that long reads as a
// hang, so this shows the named step the server is actually on plus the
// artifact forming underneath it.
//
// Every phase here is a real server event (see backend/apps/core/ai_sse.py),
// never a timed guess — if the provider stalls, the panel visibly stalls too,
// which is the honest signal.

import { useEffect, useState } from "react";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface AiProgressPhase {
  /** Matches the `phase` value the server sends. */
  key: string;
  label: string;
}

interface AiProgressProps {
  phases: AiProgressPhase[];
  /** Server's current phase; null before the first frame arrives. */
  currentPhase: string | null;
  /** Feature-shaped live preview, rendered under the phase list. */
  children?: React.ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Consequence of cancelling, shown next to the button. Cancelling an AI
   * generation is not free — say so rather than letting them find out. */
  cancelNote?: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Seconds since mount, ticking once a second. */
function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return seconds;
}

export function AiProgress({
  phases,
  currentPhase,
  children,
  onCancel,
  cancelLabel = "Cancel",
  cancelNote,
}: AiProgressProps) {
  const elapsed = useElapsedSeconds();
  // -1 until the first phase frame lands, which leaves every row pending.
  const currentIndex = phases.findIndex((p) => p.key === currentPhase);

  return (
    <div className="flex flex-col gap-4 py-2">
      <ol className="flex flex-col gap-2" aria-live="polite">
        {phases.map((phase, i) => {
          const done = currentIndex > i;
          const active = currentIndex === i;
          return (
            <li
              key={phase.key}
              className={cn(
                "flex items-center gap-2 text-sm",
                active
                  ? "text-foreground"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60",
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : active ? (
                  <Spinner size="sm" label={`${phase.label} in progress`} />
                ) : (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current"
                    aria-hidden="true"
                  />
                )}
              </span>
              {phase.label}
            </li>
          );
        })}
      </ol>

      {children}

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <span
          className="font-mono text-xs tabular-nums text-muted-foreground"
          aria-label="Time elapsed"
        >
          {formatElapsed(elapsed)}
        </span>
        {onCancel && (
          <div className="flex items-center gap-3">
            {cancelNote && (
              <span className="text-right text-xs text-muted-foreground">
                {cancelNote}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Live preview of a forming draft: the real title and the headings written
 * so far. New rows fade in so the list doesn't visibly jump. */
export function AiDraftPreview({
  title,
  headings,
}: {
  title: string;
  headings: string[];
}) {
  if (!title && headings.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
      {title && (
        <p className="text-sm font-medium leading-snug">
          &ldquo;{title}&rdquo;
        </p>
      )}
      {headings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {headings.map((heading, i) => (
            <li
              key={`${i}-${heading}`}
              className="motion-safe:animate-in motion-safe:fade-in truncate text-xs text-muted-foreground"
            >
              {heading || "…"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
