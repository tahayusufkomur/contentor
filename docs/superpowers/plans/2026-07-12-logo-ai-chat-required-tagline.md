# Logo Studio — AI Chat Requires a Tagline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap where a "Design with AI" logo can finish with an empty tagline, so both ways into a Logo Studio Ideas pick (curated gallery, AI chat) always produce a complete logo (mark + name + tagline).

**Architecture:** Two independent halves. Backend: tighten `TAGLINE_STAGE_PROMPT` so the model never proposes an empty-tagline candidate (prompt-text-only, no validator change). Frontend: replace the `skip_tagline` chat action/button (which finishes with whatever tagline the name stage left, always `""`) with `use_brief_tagline`, which substitutes the Brief's own optional tagline and only exists when that field is non-empty — otherwise the coach must pick an AI candidate.

**Tech Stack:** Next.js 14 + React + TypeScript (vitest, no `@testing-library/react` in this project), Django 5.1 + DRF (pytest).

## Global Constraints

- **Commits:** This repo forbids committing unless the user explicitly asks (CLAUDE.md). The user asked for this plan to be implemented — treat each task's own "Commit" step as authorized. Never push.
- **Pre-commit / quality:** `npm run lint` in `frontend-customer` is a pre-existing, repo-wide unrunnable gate (no ESLint config; `next lint` always drops into an interactive setup wizard) — do not attempt it, do not treat its absence as a defect. `npm run build` (frontend-customer) and `make lint` (repo root, backend) must both be clean for any file this plan touches.
- **No backend validation-level enforcement:** this is a prompt-text-only change. Do NOT add a non-empty check to `_validate_converse_design` or any validator — that function is shared with the name stage, which intentionally always has `tagline: ""`. Real compliance is the model's responsibility, guarded only by the prompt text and a content-guard test (Task 1).
- **No backfill/migration:** do not write a script or management command to touch existing coach logos already saved with an empty tagline. Forward-looking only.
- **No new test dependencies:** do not add `@testing-library/react`, `jsdom`-based component rendering, or any other new frontend test tooling. `studio-chat.tsx` has zero component-render tests today (confirmed: no test file exists for it or any sibling in `components/logo/`) — this plan keeps that boundary. Testable *logic* extracted into `wizard-view.ts` (a plain function) gets a normal vitest unit test, exactly like every other export in that file already has.
- **Test dirs:** frontend commands run from `frontend-customer/`; backend commands from the repo root (they exec into the `django` container, e.g. `docker compose exec -T django pytest ...`).
- **Shared working tree:** `main` can move under concurrent agents — verify branch+base before any commit.

---

### Task 1: Backend — tighten the tagline-stage prompt

Removes the instruction that lets the model return a blank tagline candidate, and adds a content-guard test so a future edit can't silently reintroduce it.

**Files:**
- Modify: `backend/apps/tenant_config/logo_converse.py:111-126` (`TAGLINE_STAGE_PROMPT`)
- Modify: `backend/apps/tenant_config/tests/test_logo_converse.py` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: no interface change — `TAGLINE_STAGE_PROMPT` stays a plain `str` constant, same name, same usage in `_STAGE_PROMPTS`.

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/tenant_config/tests/test_logo_converse.py` (after the last line, `test_tagline_stage_inherits_pinned_lockup_traced_paths`):

```python


def test_tagline_stage_prompt_never_permits_an_empty_tagline():
    """Content guard, not a behavioral test: the model's real compliance is
    unverifiable from a unit test (its response is always mocked here), so
    this only pins the prompt text itself — the old escape-hatch sentence
    must be gone and a positive non-empty requirement must be present. If
    this ever needs to change, that's a deliberate product decision, not an
    accidental revert."""
    prompt = logo_converse.TAGLINE_STAGE_PROMPT
    assert 'may keep tagline ""' not in prompt
    assert "non-empty" in prompt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_converse.py::test_tagline_stage_prompt_never_permits_an_empty_tagline -v`
Expected: FAIL — `'may keep tagline ""' not in prompt` is false against the current prompt text (it's still present), so the first assertion fails.

- [ ] **Step 3: Edit the prompt**

In `backend/apps/tenant_config/logo_converse.py`, find `TAGLINE_STAGE_PROMPT` (starts at line 111):

```python
TAGLINE_STAGE_PROMPT = (
    _SESSION_FRAME
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## This stage: THE TAGLINE

The lockup is decided (in the conversation). Return 1-3 candidates that are
the SAME design with different `tagline` text (and its color role if needed):
short, concrete, in the coach's voice — never corporate filler. If the coach
supplied their own words, style those (you may tighten them). If nothing
natural fits, one candidate may keep tagline "".

"""
    + _FONT_CATALOG
)
```

Replace the last sentence of the stage instructions (`If nothing natural fits, one candidate may keep tagline "".`) so the whole block reads:

```python
TAGLINE_STAGE_PROMPT = (
    _SESSION_FRAME
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## This stage: THE TAGLINE

The lockup is decided (in the conversation). Return 1-3 candidates that are
the SAME design with different `tagline` text (and its color role if needed):
short, concrete, in the coach's voice — never corporate filler. If the coach
supplied their own words, style those (you may tighten them). Every
candidate's tagline must be a real, non-empty line — never return "".

"""
    + _FONT_CATALOG
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_converse.py::test_tagline_stage_prompt_never_permits_an_empty_tagline -v`
Expected: PASS

- [ ] **Step 5: Run the full converse test file to confirm no regression**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_converse.py -v`
Expected: all PASS (the `_NAME_TURN` fixture's `"tagline": ""` is unaffected — that's the *name* stage, whose prompt is untouched).

- [ ] **Step 6: Lint**

Run: `docker compose exec -T django ruff check apps/tenant_config/logo_converse.py apps/tenant_config/tests/test_logo_converse.py && docker compose exec -T django ruff format --check apps/tenant_config/logo_converse.py apps/tenant_config/tests/test_logo_converse.py`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/tenant_config/logo_converse.py backend/apps/tenant_config/tests/test_logo_converse.py
git commit -m "fix(logo-studio): tagline-stage AI prompt never permits an empty tagline"
```

---

### Task 2: Frontend — `use_brief_tagline` action, button-label selector, and UI wiring

Replaces the `skip_tagline` chat action with `use_brief_tagline` (substitutes the Brief's tagline instead of finishing blank), adds a pure view-selector that decides the fallback button's label (or that it shouldn't render), and wires both into `studio-chat.tsx`'s tagline-stage button. Wiring is folded into this same task (not split out) because `chat-state.ts`'s `ChatEvent` union has exactly one consumer (`studio-chat.tsx`) — splitting the type change from its only call site would leave an intermediate commit with a broken build, which isn't an independently reviewable/testable state.

**Files:**
- Modify: `frontend-customer/src/lib/logo/chat-state.ts`
- Modify: `frontend-customer/src/lib/logo/__tests__/chat-state.test.ts`
- Modify: `frontend-customer/src/lib/logo/wizard-view.ts`
- Modify: `frontend-customer/src/lib/logo/__tests__/wizard-view.test.ts`
- Modify: `frontend-customer/src/components/logo/studio-chat.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ChatEvent` variant `{ type: "use_brief_tagline"; tagline: string }` (replaces `{ type: "skip_tagline" }`, which is deleted — no other file in the codebase references it after this task). `briefTaglineButtonLabel(tagline: string | undefined): string | null` exported from `wizard-view.ts`.

- [ ] **Step 1: Write the failing chat-state test**

In `frontend-customer/src/lib/logo/__tests__/chat-state.test.ts`, replace the existing test:

```ts
  it("skip_tagline finishes with the pinned lockup", () => {
    let s = chatReducer(initialChatState, { type: "pin", design });
    s = chatReducer(s, { type: "pin", design });
    s = chatReducer(s, { type: "skip_tagline" });
    expect(s.done).toBe(true);
    expect(s.pinnedLockup).toBe(design);
  });
```

with:

```ts
  it("use_brief_tagline finishes with the brief's tagline applied to the pinned lockup", () => {
    let s = chatReducer(initialChatState, { type: "pin", design });
    s = chatReducer(s, { type: "pin", design });
    s = chatReducer(s, {
      type: "use_brief_tagline",
      tagline: "Move every day",
    });
    expect(s.done).toBe(true);
    expect(s.pinnedLockup).toEqual({ ...design, tagline: "Move every day" });
  });
```

- [ ] **Step 2: Run it — fails**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/chat-state.test.ts`
Expected: FAIL — `chatReducer` has no `"use_brief_tagline"` case, so `s.pinnedLockup` is still the original `design` object (no `tagline` override), and the `toEqual` assertion fails.

- [ ] **Step 3: Update `chat-state.ts`**

In `frontend-customer/src/lib/logo/chat-state.ts`, change the `ChatEvent` union (remove `skip_tagline`, add `use_brief_tagline`):

```ts
export type ChatEvent =
  | { type: "user_message"; text: string }
  | { type: "draft_received" }
  | { type: "final_received"; message: string; designs: ConverseDesign[] }
  | { type: "turn_failed"; notice: string }
  | { type: "pin"; design: ConverseDesign }
  | { type: "use_brief_tagline"; tagline: string }
  | { type: "back"; stage: ChatStage }
  // Restore a persisted conversation (v2 session) or reset to a blank chat
  // (snapshot === null). Transient status/done always start fresh.
  | { type: "hydrate"; snapshot: ChatSnapshot | null };
```

Change the reducer case (replace the `"skip_tagline"` case):

```ts
    case "skip_tagline":
      return { ...state, done: true };
```

with:

```ts
    case "use_brief_tagline":
      return {
        ...state,
        pinnedLockup: state.pinnedLockup
          ? { ...state.pinnedLockup, tagline: event.tagline }
          : state.pinnedLockup,
        done: true,
      };
```

- [ ] **Step 4: Run it — passes**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/chat-state.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing wizard-view test**

In `frontend-customer/src/lib/logo/__tests__/wizard-view.test.ts`, add to the import list and add a new `describe` block:

```ts
import {
  activeStep,
  briefTaglineButtonLabel,
  currentCandidates,
  currentSelection,
  stepStatus,
} from "@/lib/logo/wizard-view";
```

```ts
describe("briefTaglineButtonLabel", () => {
  it("returns null when the brief has no tagline", () => {
    expect(briefTaglineButtonLabel(undefined)).toBeNull();
    expect(briefTaglineButtonLabel("")).toBeNull();
    expect(briefTaglineButtonLabel("   ")).toBeNull();
  });

  it("returns a quoted label for a short tagline", () => {
    expect(briefTaglineButtonLabel("Move every day")).toBe(
      'Use "Move every day"',
    );
  });

  it("trims surrounding whitespace before quoting", () => {
    expect(briefTaglineButtonLabel("  Move every day  ")).toBe(
      'Use "Move every day"',
    );
  });

  it("truncates a long tagline with an ellipsis", () => {
    const long = "A".repeat(60);
    const label = briefTaglineButtonLabel(long);
    expect(label).toBe(`Use "${"A".repeat(40)}…"`);
  });
});
```

- [ ] **Step 6: Run it — fails**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/wizard-view.test.ts`
Expected: FAIL — `briefTaglineButtonLabel` is not exported from `wizard-view.ts`.

- [ ] **Step 7: Implement `briefTaglineButtonLabel` in `wizard-view.ts`**

Append to `frontend-customer/src/lib/logo/wizard-view.ts`:

```ts
/** The tagline-stage "use the Brief's tagline instead of an AI candidate"
 * button's label, or null when there's no Brief tagline to fall back to — in
 * that case the button must not render at all, since the tagline stage never
 * offers an empty AI candidate either (picking one is then the only way to
 * finish). Truncates a long tagline so the button stays a reasonable size. */
export function briefTaglineButtonLabel(
  tagline: string | undefined,
): string | null {
  const trimmed = (tagline ?? "").trim();
  if (!trimmed) return null;
  const shown = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
  return `Use "${shown}"`;
}
```

- [ ] **Step 8: Run it — passes**

Run: `cd frontend-customer && npx vitest run src/lib/logo/__tests__/wizard-view.test.ts`
Expected: PASS

- [ ] **Step 9: Run the full pure-logic suite so far**

Run: `cd frontend-customer && npx vitest run src/lib/logo`
Expected: PASS. (This suite doesn't type-check `studio-chat.tsx`, so it passes even though Steps 1-8 alone would leave the overall `npm run build` broken — Steps 10-13 below fix that within this same task, before it's committed.)

- [ ] **Step 10: Update the import in `studio-chat.tsx`**

In `frontend-customer/src/components/logo/studio-chat.tsx`, change:

```tsx
import {
  activeStep,
  currentCandidates,
  currentSelection,
  stepStatus,
  WIZARD_STEPS,
  type WizardStep,
} from "@/lib/logo/wizard-view";
```

to:

```tsx
import {
  activeStep,
  briefTaglineButtonLabel,
  currentCandidates,
  currentSelection,
  stepStatus,
  WIZARD_STEPS,
  type WizardStep,
} from "@/lib/logo/wizard-view";
```

- [ ] **Step 11: Update `DesignCard`'s props and render**

Replace (around line 84-98):

```tsx
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
```

with:

```tsx
function DesignCard({
  design,
  brandName,
  canPick,
  briefTaglineLabel,
  onPick,
  onUseBriefTagline,
}: {
  design: ConverseDesign;
  brandName: string;
  canPick: boolean;
  briefTaglineLabel: string | null;
  onPick: () => void;
  onUseBriefTagline: () => void;
}) {
```

Replace the render (around line 120-140):

```tsx
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
```

with:

```tsx
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
          {briefTaglineLabel && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onUseBriefTagline}
            >
              {briefTaglineLabel}
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 12: Update the `DesignCard` call site**

Find where `DesignCard` is instantiated (inside the `candidates?.designs.length` branch, in the main component body — `brief` is already a prop on this component, `StudioChatProps.brief: Brief`). Replace:

```tsx
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
```

with:

```tsx
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {candidates.designs.map((design, di) => (
                    <DesignCard
                      key={di}
                      design={design}
                      brandName={brandName}
                      canPick={canPick}
                      briefTaglineLabel={
                        state.stage === "tagline"
                          ? briefTaglineButtonLabel(brief.tagline)
                          : null
                      }
                      onPick={() => dispatch({ type: "pin", design })}
                      onUseBriefTagline={() =>
                        dispatch({
                          type: "use_brief_tagline",
                          tagline: (brief.tagline ?? "").trim(),
                        })
                      }
                    />
                  ))}
                </div>
```

- [ ] **Step 13: Search the file for any other `skip_tagline`/`showSkipTagline`/`onSkipTagline` reference**

Run: `grep -n "skip_tagline\|showSkipTagline\|onSkipTagline\|Skip tagline" frontend-customer/src/components/logo/studio-chat.tsx`
Expected: no output. If anything remains, it was missed above — update it the same way (Steps 10-12 above account for the only 6 occurrences: 2 in the type, 2 in the render, 2 at the call site).

- [ ] **Step 14: Build**

Run: `cd frontend-customer && npm run build`
Expected: PASS, clean TypeScript compile, all pages generated.

- [ ] **Step 15: Run the full logo suite once more**

Run: `cd frontend-customer && npx vitest run src/lib/logo`
Expected: PASS (confirms Steps 10-13's UI wiring didn't break the pure-logic tests from Steps 1-9).

- [ ] **Step 16: Manual verification (no automated component test exists for this file — see Global Constraints)**

Run `make dev` if the stack isn't already up, open the app, navigate to a coach tenant's Logo Studio, fill the Brief with a tagline, reach the "Design with AI" chat, advance to the tagline stage, and confirm:
1. With a Brief tagline set: the fallback button reads `Use "<the tagline>"` next to "Pick this", and clicking it finishes the flow with that tagline applied (visible in the resulting recipe / Editor).
2. Go back and clear the Brief's tagline before opening chat again: at the tagline stage, no fallback button renders at all — only "Pick this" per candidate.
3. Every AI-generated tagline candidate shown is non-empty text (never a blank line).

Note in your task report whether this was actually run against a live AI-eligible tenant (requires an AI provider key configured) or whether it could only be checked structurally (e.g. via React DevTools / inspecting rendered props) because no AI-eligible tenant/key was available in this environment — say so explicitly either way, don't claim verification that didn't happen.

- [ ] **Step 17: Commit**

```bash
git add frontend-customer/src/lib/logo/chat-state.ts frontend-customer/src/lib/logo/__tests__/chat-state.test.ts frontend-customer/src/lib/logo/wizard-view.ts frontend-customer/src/lib/logo/__tests__/wizard-view.test.ts frontend-customer/src/components/logo/studio-chat.tsx
git commit -m "feat(logo-studio): AI chat's tagline stage falls back to the Brief's tagline instead of finishing blank"
```

---

### Task 3: Verification sweep

Confirms the two known paths to an empty tagline are both closed, checks for any other path the design didn't anticipate, and checks the manual-eval e2e spec.

**Files:** none modified (verification only, unless a gap is found — see Step 2).

- [ ] **Step 1: Confirm no other `done: true` path in `chat-state.ts` can leave an empty tagline**

Run: `grep -n "done: true\|done:true" frontend-customer/src/lib/logo/chat-state.ts`

Expected output: exactly two matches — the `"pin"` case's tagline-stage branch (`return { ...state, pinnedLockup: event.design, done: true };`, reachable only after picking a candidate the backend now guarantees non-empty per Task 1) and the `"use_brief_tagline"` case (Task 2, always sets a real string since the button that dispatches it only exists when `briefTaglineButtonLabel` returned non-null). If a third match appears that this plan didn't account for, STOP and report it — do not silently patch around it; it means a path exists in the running app today that this plan's design doc didn't cover, which needs a design decision, not an ad hoc fix.

- [ ] **Step 2: Check the manual AI-eval e2e spec**

Run: `grep -n "skip\|Skip\|tagline" e2e/specs/90-logo-eval.spec.ts`

Expected: no output beyond the file's `test.skip(!process.env.LOGO_EVAL, ...)` gating line (already confirmed during design — this spec doesn't exercise the tagline stage's skip/fallback UI at all). If it does reference `skip_tagline`/"Skip tagline"/an empty-tagline assumption, update it to match Task 2's new action and button text.

- [ ] **Step 3: Full frontend verification**

Run: `cd frontend-customer && npx vitest run src/lib/logo && npm run build`
Expected: PASS / clean build.

- [ ] **Step 4: Full backend verification**

Run: `docker compose exec -T django pytest apps/tenant_config/ -v`
Expected: PASS, no regressions. Then `make lint` from the repo root — expect clean on every file this plan touched; if it reports findings in unrelated pre-existing files (a known condition in this shared repo — see project memory on concurrent-agent working-tree state), attribute them explicitly and leave those files untouched.

- [ ] **Step 5: Report**

No commit for this task (verification only) unless Step 2 found a real gap in `90-logo-eval.spec.ts`, in which case commit that fix alone:

```bash
git add e2e/specs/90-logo-eval.spec.ts
git commit -m "test(logo-studio): update AI-eval spec for the Brief-tagline fallback"
```
