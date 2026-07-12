// Design-with-AI: the staged wizard. The coach converges on ONE logo across
// four explicit steps — Describe -> Icon -> Name -> Tagline. The coach opens by
// describing the logo they want (or skipping to automatic concepts); each later
// step auto-fetches candidates, shows them, and — on a pick — advances while a
// persistent "your logo so far" panel keeps the running selection in view.
// Every AI turn is a two-pass render->critique round-trip (renderDraftPngs ->
// fetchConverseFinish) that always falls back to the draft designs so a step is
// never left blank. Pure state transitions live in chat-state.ts and the view
// selectors in wizard-view.ts; this file is the view + the async turn driver.
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deriveAiBannerState } from "@/lib/logo/ai-banner";
import type { ChatEvent, ChatState } from "@/lib/logo/chat-state";
import {
  fetchConverseFinish,
  fetchConverseTurn,
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
import {
  activeStep,
  currentCandidates,
  currentSelection,
  stepStatus,
  WIZARD_STEPS,
  type WizardStep,
} from "@/lib/logo/wizard-view";
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

// The coach's Describe-step text becomes the first turn's message; a blank
// Describe falls back to this so "just show me ideas" still produces concepts.
const FIRST_PROMPT = "Show me first concepts for my brand.";
// Canned prompts that auto-fetch the next step's candidates on stage entry, so
// each step lands on options rather than an empty box.
const AUTO_PROMPTS: Record<Exclude<WizardStep, "describe">, string> = {
  icon: FIRST_PROMPT,
  name: "Show me name lockups that use this icon.",
  tagline: "Show me tagline options for this logo.",
};
const DIFFERENT_PROMPT = "Show me some different options.";

interface StudioChatProps {
  open: boolean;
  state: ChatState;
  dispatch: React.Dispatch<ChatEvent>;
  brief: Brief;
  brandName: string;
  status: LogoAiStatus | null;
  onUseDesign: (recipe: LogoRecipe, elements?: BrandPackElement[]) => void;
  onStatusChange: (turnsRemaining: number) => void;
  /** Return to the Ideas wall. */
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
      <div className="flex min-h-[128px] items-center justify-center rounded-md bg-muted/40 p-3">
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
        <div className="mt-auto flex items-center gap-2">
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

/** The persistent "your logo so far" panel — the running pick, always visible
 * so a coach can see what's locked in as they move through the steps. */
function SelectionSummary({
  state,
  brandName,
  compact,
}: {
  state: ChatState;
  brandName: string;
  compact?: boolean;
}) {
  const selection = currentSelection(state);
  return (
    <div className={compact ? "" : "space-y-3"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Your logo so far
      </p>
      <div className="flex items-center justify-center rounded-lg border bg-muted/30 p-4">
        {selection?.kind === "lockup" ? (
          <LogoRenderer
            recipe={composeConverseDesign(selection.design, brandName)}
            width={compact ? 220 : 240}
          />
        ) : selection?.kind === "icon" ? (
          <MarkRenderer
            recipe={composeIconPreview(selection.design, brandName)}
            size={compact ? 88 : 104}
          />
        ) : (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Your picks will appear here as you go.
          </p>
        )}
      </div>
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
  const [describeInput, setDescribeInput] = useState("");
  const bannerState = deriveAiBannerState({ status });
  const turnsRemaining = status?.turns_remaining ?? 0;
  const step = activeStep(state);
  const candidates = currentCandidates(state);
  const busy = state.status !== "idle";
  const gated = bannerState.kind !== "idle";
  // A trailing assistant message with no designs is a failure/notice (e.g. the
  // turn couldn't be reached) — surface it instead of a stuck "Preparing…".
  const lastMsg = state.messages.at(-1);
  const noticeText =
    lastMsg?.role === "assistant" && !lastMsg.designs?.length
      ? lastMsg.text
      : null;

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
          // Traced (image-derived) paths can't be recompiled from elements —
          // the backend inherits them verbatim when the elements match.
          mark_paths: state.pinnedIcon?.paths,
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
      // Two-pass: render the drafts, then let the AI critique its own work. Any
      // failure short-circuits to the drafts the client already holds.
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
  // effects, so auto-fetch below never sends against a stale transcript.
  const runTurnRef = useRef(runTurn);
  runTurnRef.current = runTurn;

  // Auto-fetch the current stage's candidates on entry (after a pick advances
  // the stage) so every step lands on options rather than an empty box. Guarded
  // per stage so a failed turn shows its notice instead of looping. The Describe
  // step never auto-fetches — the coach's own description kicks off the icons.
  const fetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    if (state.messages.length === 0) {
      fetchedRef.current.clear();
      return;
    }
    if (state.done || busy || gated) return;
    const stage = state.stage;
    const hasTurn = state.messages.some(
      (m) => m.role === "assistant" && m.stage === stage && m.designs?.length,
    );
    if (hasTurn || fetchedRef.current.has(stage)) return;
    fetchedRef.current.add(stage);
    void runTurnRef.current(AUTO_PROMPTS[stage]);
  }, [open, state.messages, state.stage, state.done, busy, gated]);

  // When the coach finishes (pinned a lockup, or skipped the tagline), hand the
  // final recipe up to the editor exactly once.
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

  if (!open) return null;

  const canPick = !busy && !state.done && !gated;

  function submitDescribe() {
    if (busy) return;
    const text = describeInput.trim() || FIRST_PROMPT;
    setDescribeInput("");
    // Describe owns the icon turn: mark it fetched so a failed describe isn't
    // silently re-fired with the generic prompt (the coach retries in their own
    // words via the per-step controls instead).
    fetchedRef.current.add("icon");
    void runTurn(text);
  }

  function submitRefine() {
    const text = input.trim();
    if (!text || busy || state.done) return;
    setInput("");
    void runTurn(text);
  }

  function navigate(target: WizardStep) {
    if (stepStatus(state, target) !== "done") return;
    // Describe is the very first step — returning there restarts the flow.
    if (target === "describe") {
      dispatch({ type: "hydrate", snapshot: null });
      return;
    }
    dispatch({ type: "back", stage: target });
  }

  return (
    <div data-testid="studio-chat" className="flex min-h-0 flex-1 flex-col">
      {/* Header: back-to-ideas + the Describe -> Icon -> Name -> Tagline steps. */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="max-sm:hidden">Ideas</span>
            </button>
          )}
          <nav className="flex items-center gap-1" aria-label="Design steps">
            {WIZARD_STEPS.map((s, i) => {
              const st = stepStatus(state, s.id);
              return (
                <div key={s.id} className="flex items-center">
                  {i > 0 && (
                    <span className="mx-0.5 text-muted-foreground/40">›</span>
                  )}
                  <button
                    type="button"
                    aria-current={st === "current" ? "step" : undefined}
                    disabled={st !== "done"}
                    onClick={() => navigate(s.id)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      st === "current"
                        ? "bg-primary/10 text-primary"
                        : st === "done"
                          ? "text-foreground hover:bg-accent"
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {i + 1}. {s.label}
                  </button>
                </div>
              );
            })}
          </nav>
        </div>
        <p className="flex items-center gap-1.5 text-sm font-semibold max-md:hidden">
          <Sparkles className="h-4 w-4 text-primary" />
          Design with AI
        </p>
      </div>

      {/* Body: current step (main) + persistent selection panel (aside). */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {step !== "describe" && (
            <div className="mb-6 md:hidden">
              <SelectionSummary state={state} brandName={brandName} compact />
            </div>
          )}

          {gated ? (
            <GateBanner kind={bannerState.kind} />
          ) : step === "describe" ? (
            <DescribeStep
              value={describeInput}
              busy={busy}
              onChange={setDescribeInput}
              onSubmit={submitDescribe}
            />
          ) : (
            <div className="space-y-5">
              {candidates?.message && (
                <p className="text-sm text-muted-foreground">
                  {candidates.message}
                </p>
              )}

              {busy ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  {state.status === "reviewing" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                  )}
                  {state.status === "reviewing"
                    ? "Reviewing its own work…"
                    : "Designing…"}
                </p>
              ) : candidates?.designs.length ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {candidates.designs.map((design, di) => (
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  {noticeText || "Preparing options…"}
                </p>
              )}

              {/* Per-step tweaks: a fresh batch, or describe changes for this step. */}
              {!busy && !state.done && (
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-end gap-2">
                    <textarea
                      className="min-h-[40px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm"
                      rows={1}
                      maxLength={400}
                      placeholder="Describe a change for this step… (e.g. more geometric, less playful)"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submitRefine();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      aria-label="Send"
                      disabled={!input.trim()}
                      onClick={submitRefine}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => runTurn(DIFFERENT_PROMPT)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Show different options
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      {turnsRemaining} AI design turn
                      {turnsRemaining === 1 ? "" : "s"} left this month.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {step !== "describe" && (
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-l p-4 md:block">
            <SelectionSummary state={state} brandName={brandName} />
          </aside>
        )}
      </div>
    </div>
  );
}

/** Step 1 · Describe — the coach's own words seed the first icon concepts. */
function DescribeStep({
  value,
  busy,
  onChange,
  onSubmit,
}: {
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-6">
      <div>
        <h3 className="text-lg font-semibold">Describe the logo you want</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A sentence or two is plenty — a mood, a symbol, colors to lean into or
          avoid. Or skip it and we&apos;ll propose concepts from your brand.
        </p>
      </div>
      <textarea
        className="min-h-[120px] w-full resize-none rounded-md border bg-background px-3 py-2 text-sm"
        maxLength={400}
        autoFocus
        placeholder="e.g. a calm, minimal mark — maybe a leaf or sunrise, warm earthy greens, nothing corporate"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="lg"
          className="gap-2"
          disabled={busy}
          onClick={onSubmit}
        >
          <Sparkles className="h-4 w-4" />
          Generate concepts
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={onSubmit}
          className="text-sm text-muted-foreground hover:underline disabled:opacity-50"
        >
          Skip, just show me ideas
        </button>
      </div>
    </div>
  );
}

function GateBanner({
  kind,
}: {
  kind: ReturnType<typeof deriveAiBannerState>["kind"];
}) {
  if (kind === "upsell") {
    return (
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border border-dashed p-4">
        <p className="text-sm text-muted-foreground">
          AI design is included with paid plans.
        </p>
        <Button asChild size="sm" variant="outline">
          <a href="/admin/billing/subscription">Upgrade</a>
        </Button>
      </div>
    );
  }
  return (
    <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">
      {kind === "quota_exhausted"
        ? "You've used this month's AI design turns. More next month."
        : "AI design is temporarily unavailable."}
    </p>
  );
}
