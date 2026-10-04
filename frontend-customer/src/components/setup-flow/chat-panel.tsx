"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { CopilotComposer } from "@/components/copilot/composer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { parseAnswer } from "@/components/admin/assistant/format-answer";
import { isAbortError } from "@/lib/ai-stream";
import {
  converseCopilot,
  executeCopilotAction,
  undoCopilotAction,
} from "@/lib/copilot/api";
import { isUndoableKind, runBundle, toTranscript } from "@/lib/copilot/state";
import type { AttachedPhoto, ChatEntry } from "@/lib/copilot/types";
import { announceSiteUpdated } from "@/lib/site-events";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { ApiError } from "@/types/api";
import { cn } from "@/lib/utils";

interface Applied {
  title: string;
  kind: string;
  auditId: number | null;
}

/** A copilot turn as the guided flow shows it: action cards are already
 * executed, so the entry carries what changed instead of cards to confirm. */
interface FlowEntry extends ChatEntry {
  applied?: Applied[];
  /** Stopped mid-bundle: applied.length of `planned` landed. */
  planned?: number;
  undone?: boolean;
  unavailable?: boolean;
}

export function ChatPanel({
  brandName,
  context,
  chips,
  onApplied,
  className,
}: {
  brandName: string;
  /** One line prefixed to each message so the copilot knows where we are. */
  context: string;
  chips: string[];
  /** Site changed — reload the preview and the flow state. */
  onApplied: () => void;
  className?: string;
}) {
  const [entries, setEntries] = useState<FlowEntry[]>([]);
  const [phase, setPhase] = useState<"thinking" | "applying">("thinking");
  const [attached, setAttached] = useState<AttachedPhoto[]>([]);
  // The composer can send in the same tick as the last attach; the ref is
  // the source of truth (same reasoning as CopilotBubble).
  const attachedRef = useRef<AttachedPhoto[]>([]);
  const updateAttached = useCallback(
    (next: (prev: AttachedPhoto[]) => AttachedPhoto[]) => {
      attachedRef.current = next(attachedRef.current);
      setAttached(attachedRef.current);
    },
    [],
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const { run: send, loading: sending } = useAsyncAction(
    async (raw: string) => {
      const photos = attachedRef.current;
      const message = raw.trim() || (photos.length ? "Here’s a photo." : "");
      if (!message) return;
      const coach: FlowEntry = {
        role: "coach",
        text: message,
        ...(photos.length
          ? {
              attached: photos.map((p) => ({
                id: p.id,
                title: p.title,
                ...(p.desc ? { desc: p.desc } : {}),
                ...(p.signed_url ? { signed_url: p.signed_url } : {}),
              })),
            }
          : {}),
      };
      const before = entries;
      setEntries([...before, coach]);
      updateAttached(() => []);
      setPhase("thinking");
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const done = await converseCopilot(
          {
            message: `${context}\n${message}`,
            transcript: toTranscript(before),
            selections: [],
            attached_photos: photos.map((p) => p.id),
          },
          {},
          controller.signal,
        );
        if (done.kind === "unavailable") {
          setEntries((prev) => [
            ...prev,
            { role: "assistant", text: "", unavailable: true },
          ]);
          return;
        }
        const cards = done.actions ?? [];
        const applied: Applied[] = [];
        let failed = false;
        if (cards.length > 0) {
          // Guided mode: no confirm click — run the bundle in order, stop at
          // the first failure.
          setPhase("applying");
          ({ failed } = await runBundle(
            cards.map((card) => async () => {
              const res = await executeCopilotAction(card.token);
              applied.push({
                title: card.title,
                kind: card.kind,
                auditId: res.audit_id,
              });
            }),
          ));
          if (applied.length > 0) {
            announceSiteUpdated();
            onApplied();
          }
        }
        setEntries((prev) => [
          ...prev,
          {
            role: "assistant",
            text: done.text ?? "",
            kind: done.kind,
            ...(cards.length > 0
              ? { applied, ...(failed ? { planned: cards.length } : {}) }
              : {}),
          },
        ]);
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    { errorToast: "The assistant couldn’t answer. Try again." },
  );

  const { run: undo, loading: undoing } = useAsyncAction(
    async (index: number, auditId: number) => {
      await undoCopilotAction(auditId);
      setEntries((prev) =>
        prev.map((e, i) => (i === index ? { ...e, undone: true } : e)),
      );
      announceSiteUpdated();
      onApplied();
      toast.success("Change undone");
    },
    {
      onError: (err) =>
        toast.error(
          err instanceof ApiError && err.status === 400
            ? "That change can’t be undone anymore."
            : "Couldn’t undo that. Try again.",
        ),
    },
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries, sending]);

  return (
    <section
      aria-label="Assistant"
      className={cn(
        "min-h-0 flex-col bg-[var(--sf-paper)] lg:w-[380px] lg:shrink-0 lg:border-l lg:border-[var(--sf-line)]",
        className,
      )}
    >
      <header className="hidden h-[60px] shrink-0 items-center gap-2.5 border-b border-[var(--sf-line)] px-5 lg:flex">
        <span className="flex size-7 items-center justify-center rounded-full bg-[var(--sf-brass-soft)] text-[var(--sf-brass)]">
          <Sparkles className="size-3.5" aria-hidden />
        </span>
        <span className="text-sm font-semibold">Assistant</span>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm"
      >
        {entries.length === 0 && (
          <div className="pt-2 motion-safe:animate-fade-in">
            <p className="text-lg font-semibold tracking-[-0.015em]">
              Welcome, {brandName}.
            </p>
            <p className="mt-2 leading-relaxed text-[var(--sf-graphite)]">
              I’m here for the whole setup. Ask for any change to what’s in the
              preview, like a new headline, a different photo or a warmer tone,
              and I’ll make it right away. Anything I change, you can undo.
            </p>
          </div>
        )}
        {entries.map((e, i) =>
          e.role === "coach" ? (
            <p
              key={i}
              className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--sf-tint-strong)] px-3.5 py-2.5 leading-relaxed"
            >
              {e.text}
              {e.attached && e.attached.length > 0 && (
                <span className="mt-1 block text-xs text-[var(--sf-graphite)]">
                  {e.attached.length === 1
                    ? "1 photo attached"
                    : `${e.attached.length} photos attached`}
                </span>
              )}
            </p>
          ) : (
            <AssistantTurn
              key={i}
              entry={e}
              onUndo={(auditId) => undo(i, auditId)}
              undoing={undoing}
            />
          ),
        )}
        {sending && (
          <p className="flex items-center gap-2 text-[var(--sf-graphite)]">
            <Spinner size="sm" className="text-[var(--sf-brass)]" />
            {phase === "applying" ? "Making the changes…" : "Thinking…"}
          </p>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-1 pt-2 [scrollbar-width:none]">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              disabled={sending}
              onClick={() => send(c)}
              className="shrink-0 rounded-full border border-[var(--sf-line)] bg-white px-3 py-1.5 text-xs text-[var(--sf-ink)] transition-colors hover:border-[var(--sf-line-strong)] hover:bg-[var(--sf-tint)] disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="shrink-0 [&_.copilot-composer]:min-h-[2.75rem] [&>div]:border-t-0">
        <CopilotComposer
          onSend={send}
          sending={sending}
          attached={attached}
          onAttach={(p) => updateAttached((prev) => [...prev, p])}
          onRemoveAttachment={(id) =>
            updateAttached((prev) => prev.filter((p) => p.id !== id))
          }
        />
      </div>
    </section>
  );
}

function AssistantTurn({
  entry,
  onUndo,
  undoing,
}: {
  entry: FlowEntry;
  onUndo: (auditId: number) => void;
  undoing: boolean;
}) {
  if (entry.unavailable) {
    return (
      <p className="leading-relaxed text-[var(--sf-graphite)]">
        The assistant is taking a short break. Try again in a minute.
      </p>
    );
  }
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  // Links would leave the guided flow — keep their labels, drop the hrefs.
  const prose = parseAnswer(entry.text, origin).text;
  const applied = entry.applied ?? [];
  const last = [...applied]
    .reverse()
    .find((a) => a.auditId != null && isUndoableKind(a.kind));

  return (
    <div className="mr-4 motion-safe:animate-fade-in-up">
      {prose && <p className="whitespace-pre-wrap leading-relaxed">{prose}</p>}
      {(applied.length > 0 || entry.planned) && (
        <div
          className={cn(
            "mt-3 rounded-xl border border-[var(--sf-line)] bg-white",
            entry.undone && "opacity-60",
          )}
        >
          <ul className="space-y-1.5 px-3.5 py-3">
            {applied.map((a, j) => (
              <li key={j} className="flex gap-2 text-[13px]">
                <Check
                  className="mt-0.5 size-3.5 shrink-0 text-[var(--sf-brass)]"
                  strokeWidth={2.5}
                  aria-hidden
                />
                <span className={cn(entry.undone && "line-through")}>
                  {a.title}
                </span>
              </li>
            ))}
            {entry.planned != null && (
              <li className="text-[13px] text-[var(--sf-graphite)]">
                Stopped after {applied.length} of {entry.planned} changes. Ask
                again to finish the rest.
              </li>
            )}
          </ul>
          {last?.auditId != null && (
            <div className="flex items-center justify-between border-t border-[var(--sf-line)] px-3.5 py-2 text-xs">
              <span className="text-[var(--sf-faint)]">
                {entry.undone ? "Undone" : "Applied to your site"}
              </span>
              {!entry.undone && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={undoing}
                  onClick={() => onUndo(last.auditId as number)}
                  className="-my-1 -mr-2 h-7 rounded-full px-2.5"
                >
                  <Undo2 aria-hidden />
                  Undo
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
