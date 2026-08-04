"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAbortError } from "@/lib/ai-stream";
import { converseCopilot } from "@/lib/copilot/api";
import { reduceChat, toTranscript } from "@/lib/copilot/state";
import type { ChatEntry, SelectionPayload } from "@/lib/copilot/types";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { ActionCard } from "./action-card";
import { SelectionOverlay } from "./selection-overlay";

/** The coach's floating AI assistant. Mounted (public layout) only for the
 * coach; the backend re-verifies on every call. `?copilot=1` opens it. */
export function CopilotBubble() {
  const t = useTranslations("student.copilot");
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [selections, setSelections] = useState<SelectionPayload[]>([]);
  const [selecting, setSelecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (params.get("copilot") === "1") setOpen(true);
  }, [params]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries]);

  const addSelection = useCallback((p: SelectionPayload) => {
    setSelections((prev) => [...prev, p].slice(-5));
    setOpen(true);
  }, []);

  const { run: send, loading: sending } = useAsyncAction(
    async () => {
      const message = input.trim();
      if (!message) return;
      const withCoach: ChatEntry[] = [
        ...entries,
        { role: "coach", text: message },
      ];
      setEntries(withCoach);
      setInput("");
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const done = await converseCopilot(
          { message, transcript: toTranscript(entries), selections },
          { onPhase: () => {} },
          controller.signal,
        );
        setEntries(reduceChat(withCoach, done));
        setSelections([]);
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    { errorToast: t("error") },
  );

  if (!open) {
    return (
      <Button
        data-copilot-ui
        className="fixed bottom-5 right-5 z-[60] gap-2 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden />
        {t("bubble")}
      </Button>
    );
  }

  return (
    <>
      {selecting && (
        <SelectionOverlay
          onSelect={addSelection}
          onExit={() => setSelecting(false)}
        />
      )}
      <div
        data-copilot-ui
        className="fixed bottom-5 right-5 z-[60] flex h-[min(34rem,80vh)] w-[min(24rem,calc(100vw-2.5rem))] flex-col rounded-xl border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-semibold">{t("title")}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            aria-label={t("close")}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto p-3 text-sm"
        >
          {entries.length === 0 && (
            <p className="text-muted-foreground">{t("empty")}</p>
          )}
          {entries.map((e, i) => (
            <div key={i}>
              <div
                className={
                  e.role === "coach"
                    ? "ml-8 rounded-lg bg-primary/10 p-2"
                    : "mr-8 rounded-lg bg-muted p-2"
                }
              >
                {e.text === "__unavailable__" ? t("resting") : e.text}
              </div>
              {e.cards?.map((card, j) => (
                <ActionCard key={`${i}-${j}`} card={card} />
              ))}
            </div>
          ))}
          {sending && <p className="text-muted-foreground">{t("thinking")}</p>}
        </div>
        {selections.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t p-2">
            {selections.map((s, i) => (
              <button
                key={i}
                type="button"
                className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                onClick={() =>
                  setSelections((prev) => prev.filter((_, j) => j !== i))
                }
                title={t("removeSelection")}
              >
                {s.block_id ?? s.tag}: {s.text.slice(0, 24)} ✕
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 border-t p-3">
          <Button
            size="sm"
            variant={selecting ? "brand" : "outline"}
            onClick={() => setSelecting((v) => !v)}
          >
            {t("select")}
          </Button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("placeholder")}
            className="flex-1 rounded-lg border bg-background px-2 text-sm"
          />
          <Button
            size="sm"
            onClick={send}
            loading={sending}
            loadingText={t("sending")}
          >
            {t("send")}
          </Button>
        </div>
      </div>
    </>
  );
}
