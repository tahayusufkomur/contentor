// Design-with-AI: the staged 1-on-1 chat panel. The coach converges on ONE
// logo across three stages (Icon -> Name -> Tagline); each assistant turn
// returns candidate designs the coach picks from, and every turn is a
// two-pass render->critique round-trip (renderDraftPngs -> fetchConverseFinish)
// that always falls back to the draft designs so the coach is never left with
// a blank turn. Pure transitions live in chat-state.ts; this file is the view
// + the async turn driver.
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deriveAiBannerState } from "@/lib/logo/ai-banner";
import type { ChatEvent, ChatState } from "@/lib/logo/chat-state";
import {
  fetchConverseFinish,
  fetchConverseTurn,
  type ChatStage,
  type ConverseTurnResponse,
  type LogoAiStatus,
} from "@/lib/logo/converse-api";
import {
  composeConverseDesign,
  composeIconPreview,
  type BrandPackElement,
  type Brief,
  type ConverseDesign,
} from "@/lib/logo/composer";
import type { LogoRecipe } from "@/types/logo";
import { LogoRenderer, MarkRenderer } from "./logo-renderer";
import { renderDraftPngs } from "./render-draft";

const NOTICES: Record<ConverseTurnResponse["source"], string> = {
  quota_exhausted: "You've used this month's AI design turns. More next month.",
  disabled: "AI design is temporarily unavailable.",
  upgrade_required: "AI design is included with paid plans.",
  error: "Couldn't design that turn — try again.",
  draft: "",
  ai: "",
};

const FIRST_PROMPT = "Show me first concepts for my brand.";

const STAGES: { id: ChatStage; label: string }[] = [
  { id: "icon", label: "Icon" },
  { id: "name", label: "Name" },
  { id: "tagline", label: "Tagline" },
];

interface StudioChatProps {
  open: boolean;
  state: ChatState;
  dispatch: React.Dispatch<ChatEvent>;
  brief: Brief;
  brandName: string;
  status: LogoAiStatus | null;
  onUseDesign: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void;
  onStatusChange: (turnsRemaining: number) => void;
  onClose?: () => void;
}

/** A design candidate has no lockup fields until the name stage — render the
 * bare mark for icon-stage designs, the full lockup for everything after. */
function isIconDesign(design: ConverseDesign): boolean {
  return !design.layout && !design.font && !design.typography;
}

function DesignCard({
  design,
  brandName,
  canPick,
  showSkipTagline,
  onPick,
  onSkipTagline,
}: {
  design: ConverseDesign;
  brandName: string;
  canPick: boolean;
  showSkipTagline: boolean;
  onPick: () => void;
  onSkipTagline: () => void;
}) {
  const icon = isIconDesign(design);
  const recipe = icon
    ? composeIconPreview(design, brandName)
    : composeConverseDesign(design, brandName);
  return (
    <div
      data-testid="chat-design-card"
      className="flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-sm ring-1 ring-primary/20"
    >
      <div className="flex items-center justify-center rounded-md bg-muted/40 p-3">
        {icon ? (
          <MarkRenderer recipe={recipe} size={120} />
        ) : (
          <LogoRenderer recipe={recipe} width={280} />
        )}
      </div>
      {design.rationale && (
        <p className="text-xs italic text-muted-foreground">
          {design.rationale}
        </p>
      )}
      {canPick && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={onPick}
          >
            Pick this
          </Button>
          {showSkipTagline && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onSkipTagline}
            >
              Skip tagline
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function StudioChat({
  open,
  state,
  dispatch,
  brief,
  brandName,
  status,
  onUseDesign,
  onStatusChange,
  onClose,
}: StudioChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bannerState = deriveAiBannerState({ status });
  const turnsRemaining = status?.turns_remaining ?? 0;
  const stageIndex = STAGES.findIndex((s) => s.id === state.stage);

  async function runTurn(text: string) {
    dispatch({ type: "user_message", text });
    try {
      const resp = await fetchConverseTurn({
        stage: state.stage,
        brief: {
          niche: brief.niche,
          style_chips: brief.styleChips,
          vibe: brief.vibe ?? "",
        },
        transcript: state.messages.map((m) => ({ role: m.role, text: m.text })),
        pinned: {
          mark_elements: state.pinnedIcon?.elements,
          lockup: state.pinnedLockup ?? undefined,
        },
        message: text,
      });
      onStatusChange(resp.turns_remaining);
      if (resp.source !== "ai") {
        dispatch({ type: "turn_failed", notice: NOTICES[resp.source] });
        return;
      }
      // Single-pass backend (no token / already final): show it as-is.
      if (resp.phase === "final" || !resp.token) {
        dispatch({
          type: "final_received",
          message: resp.message,
          designs: resp.designs,
        });
        return;
      }
      // Two-pass: render the drafts, then let the AI critique its own work.
      // Any failure short-circuits to the drafts the client already holds.
      dispatch({ type: "draft_received" });
      let images: string[];
      try {
        images = await renderDraftPngs(resp.designs, state.stage, brandName);
      } catch {
        dispatch({
          type: "final_received",
          message: resp.message,
          designs: resp.designs,
        });
        return;
      }
      try {
        const final = await fetchConverseFinish(resp.token, images);
        dispatch({
          type: "final_received",
          message: final.source === "error" ? resp.message : final.message,
          designs: final.designs.length ? final.designs : resp.designs,
        });
      } catch {
        dispatch({
          type: "final_received",
          message: resp.message,
          designs: resp.designs,
        });
      }
    } catch {
      dispatch({
        type: "turn_failed",
        notice: "Couldn't reach the design studio just now.",
      });
    }
  }

  // Always call the freshest runTurn (it closes over the current state) from
  // effects, so the auto-fire below never sends against a stale transcript.
  const runTurnRef = useRef(runTurn);
  runTurnRef.current = runTurn;

  // First open with an empty transcript kicks off the conversation itself, so
  // the coach lands on candidates rather than a blank prompt.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      return;
    }
    if (
      !startedRef.current &&
      state.messages.length === 0 &&
      state.status === "idle" &&
      bannerState.kind === "idle"
    ) {
      startedRef.current = true;
      void runTurnRef.current(FIRST_PROMPT);
    }
  }, [open, state.messages.length, state.status, bannerState.kind]);

  // When the coach finishes (pinned a lockup, or skipped the tagline), hand
  // the final recipe up to the editor exactly once.
  const usedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      usedRef.current = false;
      return;
    }
    if (state.done && !usedRef.current && state.pinnedLockup) {
      usedRef.current = true;
      onUseDesign(
        composeConverseDesign({ ...state.pinnedLockup }, brandName),
        state.pinnedLockup.elements,
      );
    }
  }, [open, state.done, state.pinnedLockup, brandName, onUseDesign]);

  // Keep the newest turn in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [state.messages.length, state.status]);

  if (!open) return null;

  const lastAssistantIndex = state.messages.reduce(
    (last, m, i) => (m.role === "assistant" ? i : last),
    -1,
  );
  const inputDisabled =
    state.status !== "idle" || state.done || bannerState.kind !== "idle";

  function submit() {
    const text = input.trim();
    if (!text || inputDisabled) return;
    setInput("");
    void runTurn(text);
  }

  return (
    <div
      data-testid="studio-chat"
      className="flex w-full flex-col border-l bg-background max-md:fixed max-md:inset-0 max-md:z-[130] md:w-[420px]"
    >
      {/* Header: title + Icon -> Name -> Tagline progress strip. */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Design with AI
          </p>
          <div className="mt-1.5 flex items-center gap-1">
            {STAGES.map((s, i) => {
              const isCurrent = s.id === state.stage;
              const isEarlier = i < stageIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={isCurrent ? "step" : undefined}
                  disabled={!isEarlier}
                  onClick={() =>
                    isEarlier && dispatch({ type: "back", stage: s.id })
                  }
                  className={`rounded-md px-2 py-0.5 text-xs ${
                    isCurrent
                      ? "bg-primary/10 font-medium text-primary"
                      : isEarlier
                        ? "text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close chat"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Transcript. */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {state.messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {m.text}
                </p>
              </div>
            );
          }
          const isLatest = i === lastAssistantIndex;
          // Only the newest turn, and only while the conversation is still on
          // the stage those candidates were designed for — otherwise a pinned
          // icon could be re-picked as a lockup after moving on.
          const canPick =
            isLatest &&
            !state.done &&
            state.status === "idle" &&
            m.stage === state.stage;
          return (
            <div key={i} className="space-y-3">
              {m.text && (
                <div className="flex justify-start">
                  <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
                    {m.text}
                  </p>
                </div>
              )}
              {m.designs && m.designs.length > 0 && (
                <div className="space-y-3">
                  {m.designs.map((design, di) => (
                    <DesignCard
                      key={di}
                      design={design}
                      brandName={brandName}
                      canPick={canPick}
                      showSkipTagline={state.stage === "tagline"}
                      onPick={() => dispatch({ type: "pin", design })}
                      onSkipTagline={() => dispatch({ type: "skip_tagline" })}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {state.status === "designing" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            Designing…
          </p>
        )}
        {state.status === "reviewing" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Reviewing its own work…
          </p>
        )}
      </div>

      {/* Composer / gate banners. */}
      <div className="border-t p-3">
        {bannerState.kind === "upsell" && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
            <p className="text-xs text-muted-foreground">
              AI design is included with paid plans.
            </p>
            <Button asChild size="sm" variant="outline">
              <a href="/admin/billing/subscription">Upgrade</a>
            </Button>
          </div>
        )}
        {bannerState.kind === "quota_exhausted" && (
          <p className="text-xs text-muted-foreground">
            You&apos;ve used this month&apos;s AI design turns. More next month.
          </p>
        )}
        {bannerState.kind === "disabled" && (
          <p className="text-xs text-muted-foreground">
            AI design is temporarily unavailable.
          </p>
        )}
        {bannerState.kind === "idle" && (
          <div className="flex items-end gap-2">
            <textarea
              className="min-h-[40px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm"
              rows={1}
              maxLength={400}
              placeholder={
                state.done
                  ? "Design complete."
                  : "Ask for a change, or describe what you want…"
              }
              value={input}
              disabled={inputDisabled}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              aria-label="Send"
              className="gap-1.5"
              disabled={inputDisabled || !input.trim()}
              onClick={submit}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {bannerState.kind === "idle" && !state.done && (
          <p className="mt-1.5 text-right text-[11px] text-muted-foreground">
            {turnsRemaining} AI design turn{turnsRemaining === 1 ? "" : "s"}{" "}
            left this month.
          </p>
        )}
      </div>
    </div>
  );
}
