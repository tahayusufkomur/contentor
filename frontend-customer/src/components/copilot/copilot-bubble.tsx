"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, SquarePen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { parseAnswer } from "@/components/admin/assistant/format-answer";
import { isAbortError } from "@/lib/ai-stream";
import { converseCopilot } from "@/lib/copilot/api";
import { reduceChat, toTranscript } from "@/lib/copilot/state";
import { clearEntries, loadEntries, saveEntries } from "@/lib/copilot/storage";
import type { ChatEntry, SelectionPayload } from "@/lib/copilot/types";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { ActionCard, ApplyAllBar, CardBundleProvider } from "./action-card";
import { SelectionOverlay } from "./selection-overlay";

/** Assistant text with the markdown-lite link contract: `[label](/path)`
 * links are stripped from the prose and rendered as tappable chips, so a
 * coach never sees a raw path (same contract as help-chat's AnswerBody). */
function AssistantText({ text }: { text: string }) {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const { text: prose, links } = parseAnswer(text, origin);
  return (
    <>
      {prose}
      {links.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1">
          {links.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              className="rounded-full border px-2 py-0.5 text-xs font-medium text-primary"
            >
              {l.label}
            </NavLink>
          ))}
        </span>
      )}
    </>
  );
}

/** The coach's floating AI assistant. Mounted (public layout) only for the
 * coach; the backend re-verifies on every call. `?copilot=1` opens it. */
export function CopilotBubble() {
  const t = useTranslations("student.copilot");
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [selections, setSelections] = useState<SelectionPayload[]>([]);
  const [selecting, setSelecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Persistence hydrates in an effect (localStorage is unavailable during
  // SSR). `hydrated` must be STATE, not a ref: a ref flips mid-effects-pass,
  // letting the save effect run with its stale initial-[] closure and wipe
  // the stored chat before StrictMode's second mount pass re-reads it. As
  // state, the save effect can't observe hydrated=true until the re-render
  // that also carries the loaded entries.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // window.location, NOT useSearchParams — avoids the Next 14 client-side
    // Suspense bailout (same pattern as owner/edit-sidebar.tsx).
    const params = new URLSearchParams(window.location.search);
    if (params.get("copilot") === "1") setOpen(true);
    setEntries(loadEntries());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveEntries(entries);
  }, [hydrated, entries]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setEntries([]);
    setSelections([]);
    clearEntries();
  }, []);

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
          <span className="flex items-center gap-1">
            {entries.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={newChat}
                aria-label={t("newChat")}
                title={t("newChat")}
              >
                <SquarePen className="size-4" aria-hidden />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </span>
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
                {e.text === "__unavailable__" ? (
                  t("resting")
                ) : e.role === "assistant" ? (
                  <AssistantText text={e.text} />
                ) : (
                  e.text
                )}
              </div>
              {e.cards && e.cards.length > 0 && (
                <CardBundleProvider>
                  {e.cards.map((card, j) => (
                    <ActionCard key={`${i}-${j}`} card={card} />
                  ))}
                  {e.cards.length > 1 && (
                    <div className="mt-2">
                      <ApplyAllBar />
                    </div>
                  )}
                </CardBundleProvider>
              )}
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
