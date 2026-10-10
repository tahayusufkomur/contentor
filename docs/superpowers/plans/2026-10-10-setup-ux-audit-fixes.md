# /setup UX Audit Fixes, Phase 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "Now" findings of the 2026-10-09 /setup UX audit. After this, a coach's typed words are never dropped, the header never disappears, the plan price shows before go-live, drafts never hang, errors say what went wrong, AI suggestions stop inventing facts, and turns stop slowing down as setup goes on.

**Architecture:** Small edits to the existing interview engine (`interview_brief.py`, `interview.py`, `interview_milestones.py`, `interview_golive.py`) and the setup-flow components (`question-screen.tsx`, `look-cards.tsx`, `draft-review.tsx`, `setup-flow.tsx`, `answer-box.tsx`). There are no new modules, endpoints or migrations. Three new guide keys (`starter`, `why`, `plan`) travel in the existing guide dict and the stored transcript.

**Tech Stack:** Django 5.1 with pytest (run in the `django` container), Next.js 14 with vitest. The repo has no DOM testing library: frontend tests cover pure functions in `lib/` and `renderToStaticMarkup` output. Click and effect behaviour is checked in the browser in Task 12.

**Spec:** the UX audit report of 2026-10-09 (given in chat only; summary in memory `contentor-setup-ux-audit-2026-10-09`). Finding ids (N1, R1, G1…) below refer to that report. Phases 2 and 3 are at the end; each needs its own plan.

## Before Task 1: the shared working tree (decide first)

The audit was walked on top of about 81 uncommitted files from the 2026-10-09 session: the socials picker, calendar layout, look tags (`STYLE_TAGS`), schedule `slots`, Jev, `look_copy.py`, and the AI-logo spec and plan. These fixes edit the same files (`question-screen.tsx`, `interview_brief.py`, `interview_milestones.py`, `interview.py`, `look-cards.tsx`, `lib/interview.ts`, `lib/setup-flow.ts`). Ask the user which to do:

- **(recommended)** Commit that work first, as its own commits, so this plan starts from a clean tree and its diffs are only its own.
- Or build on top of it and stage only these hunks per task (`git add -p`), checking `git diff --cached --stat` before every commit.

Line numbers below are from the working tree as of 2026-10-10 09:00.

## Global Constraints

- Coaches are non-technical. UI copy has no raw codes, slugs or field ids (memory `contentor-coach-non-technical-ux`).
- Guide copy: plain, warm, no exclamation marks, no flattery (`interview.SYSTEM`).
- Loading and feedback: async buttons use `<Button loading>`, async handlers use `useAsyncAction`, action outcomes are sonner toasts, field validation stays inline, and motion is CSS-only and `motion-safe:` gated (root `CLAUDE.md`).
- Setup-flow colours come from the `--sf-*` tokens in `tokens.ts`. The only exception is `text-destructive` for inline field errors.
- Commit only after the user has said to commit (`CLAUDE.md`: "Never commit unless explicitly asked"). Before any commit, run `git rev-parse --abbrev-ref HEAD` and `git log --oneline -3`; this tree is shared with other agents.
- Run only one heavy job at a time. Per task, run the focused test file. Run full `make test`, `make test-frontend`, `make typecheck` and `make lint` once, in Task 12.
- Backend single test: `docker compose exec django pytest apps/tenant_config/tests/<file>.py::<name> -q`. Frontend single file: `cd frontend-customer && npx vitest run <path>`.

## Review Focus

1. **Going back to an answer sent as tiles plus a note.** The tiles show ticked again, the note is back in the box, and Continue with nothing changed moves on. Pinned by Task 1's vitest (`pickedOptions` and `noteOf` on a `withNote` answer).
2. **A note typed on a draft review screen, then Continue.** It must be sent as a change to the draft and must never approve it. Task 1 builds this; Task 12 checks it in the browser, since there is no DOM test library.
3. **The draft task dies after the draft row exists** (the `KeyError('days')` from a stale worker). Status must end `ready` with the draft shown, not `failed`. Pinned by Task 6's second backend test.
4. **A coach already on a paid plan** sees no plan badges. Pinned by Task 5's backend test.
5. **The socials check in the browser matches the server.** A full profile URL with a query string or trailing slash is accepted by the client exactly when the server accepts it. Pinned by Task 7's matching vitest and pytest tables.

---

## Findings → tasks

| Audit finding | Task |
|---|---|
| N1 typed words dropped (Top 1), N6 misleading disabled label | 1 |
| N2 header disappears (Top 2), N3 three confirmations, N5 auto-opening preview | 2 |
| N4 Continue below the fold (Top 9) | 3 |
| G1 invented facts, free-text prices, contact (Top 7) | 4 |
| Plan price first at go-live (Top 3), E1 offer descriptions hidden | 5 |
| R1 "Redrafting…" forever (Top 8) | 6 |
| R2 generic error, socials checked only on the server | 7 |
| R3 no login button on verify | 8 |
| G3 look filters | 9 |
| P1 time estimate copy (Top 10, copy part), E3 "typing skips questions" | 10 |
| F1 full 80-turn history on every turn (part of Top 4) | 11 |
| Walk, time and full gates | 12 |

---

### Task 1: Continue sends the picked tiles and the typed note together (N1, N6)

**Files:**
- Modify: `frontend-customer/src/lib/interview.ts:197-204` (`pickedOptions`), and add `withNote`, `noteOf` next to it
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx:80-113` (derived state), `:140-177` (`proceed`), `:232-233` ("You said"), `:264-277` (`LookCardsView` `selected`), `:413-432` (Continue label), `:484-499` (`AnswerBox` `onSubmit`)
- Modify: `frontend-customer/src/components/setup-flow/answer-box.tsx:90-99` (Send becomes an icon)
- Test: `frontend-customer/src/lib/__tests__/interview.test.ts`

**Interfaces:**
- Produces: `withNote(message: string, note: string): string` and `noteOf(answer: string): string` in `@/lib/interview`. In `question-screen.tsx`, the `note` const (the trimmed box text) and `proceed(spoken?: boolean, words?: string)`, which Tasks 2 and 3 call.

- [ ] **Step 1: Write the failing test**

In `interview.test.ts`, add `noteOf` and `withNote` to the existing import from `@/lib/interview`, then append:

```ts
describe("answers sent with a note", () => {
  const step: GuideTurn = {
    ack: "",
    question: "Who do you teach?",
    field: "audience",
    can_delegate: false,
    multi: true,
    options: ["Desk workers needing relief", "Runners"],
  };
  it("puts the note on its own line after the picks", () => {
    expect(
      withNote("Desk workers needing relief", "  mostly women over 40 "),
    ).toBe("Desk workers needing relief\nmostly women over 40");
    expect(withNote("", "just a note")).toBe("just a note");
    expect(withNote("Runners", "")).toBe("Runners");
  });
  it("going back ticks the tiles and puts the note back in the box", () => {
    const answer = withNote("Desk workers needing relief", "mostly women over 40");
    expect(pickedOptions({ ...step, answer })).toEqual([
      "Desk workers needing relief",
    ]);
    expect(noteOf(answer)).toBe("mostly women over 40");
    expect(noteOf("Runners")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: FAIL, `withNote` is not exported.

- [ ] **Step 3: Implement the helpers**

In `lib/interview.ts`, change the first line of `pickedOptions`' body and add the two helpers above it:

```ts
/** A picked answer sent with the coach's own words: the picks, then the
 * note on the next line. The server reads both; going back splits them. */
export const withNote = (message: string, note: string): string =>
  [message, note.trim()].filter(Boolean).join("\n");

/** The note an answer was sent with (see withNote), or "". */
export const noteOf = (answer: string): string =>
  answer.split("\n").slice(1).join("\n").trim();

/** The options a past answer picked (several on a multi question, sent as
 * the ticked labels joined by ", " — labels may hold commas themselves). A
 * note sent with them sits on the lines after. */
export function pickedOptions(step: QuestionStep): string[] {
  if (!step.answer) return [];
  const said = step.answer.split("\n")[0].trim().toLowerCase();
  // …rest unchanged
```

- [ ] **Step 4: Run the test and check it passes**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: PASS (all `interview.test.ts` tests).

- [ ] **Step 5: Use them in the question screen**

In `question-screen.tsx`, add `noteOf` and `withNote` to the `@/lib/interview` import. Replace lines 80-113 (from `const multi` through the old `typed` const) with:

```tsx
  const multi = !!step.multi && step.options.length > 1;
  const picked = pickedOptions(step);
  const ticked = draft.ticked ?? picked;
  const review = isReview(cards) ? cards : null;
  const looks = cards && !isReview(cards) ? cards : null;
  // A typed answer (not a tile, a card or "you decide") goes back in the
  // box, and so does the note sent with picked tiles.
  const typed =
    live || cards || !step.answer || step.answer === DELEGATE_TEXT
      ? ""
      : picked.length
        ? noteOf(step.answer)
        : step.answer;
  // What is in the box now: Continue sends it with the picks.
  const note = (draft.text ?? typed).trim();
  const changed =
    (draft.card
      ? draft.card.label !== step.answer
      : ticked.join("\n") !== picked.join("\n")) || note !== typed.trim();
  // A schedule question: the tile picks weekly or one-time, the picker the dates.
  const mode: ScheduleMode = ticked[0] === "One-time" ? "once" : "recurring";
  const sched = step.schedule ? (draft.schedule ?? {}) : null;
  // A social-accounts question: a handle or link for each network ticked.
  const none = !!step.alone && ticked.includes(step.alone);
  const networks = step.socials && !none ? ticked : [];
  const socials = step.socials ? (draft.socials ?? {}) : null;
  const canContinue = review
    ? !!note ||
      review.status === "waiting" ||
      (review.status === "ready" && !!review.item)
    : looks
      ? !!draft.card || (!live && !!step.answer)
      : sched
        ? ticked.length > 0 && scheduleValid(mode, sched)
        : socials
          ? ticked.length > 0 && networks.every((n) => !!socials[n]?.trim())
          : ticked.length > 0 || !!note;
```

Replace `proceed` (lines 140-177) with:

```tsx
  // Continue (and Enter in the box) sends the picks together with the
  // coach's note. On a review screen the note is a change to the draft.
  const proceed = (spoken = false, words = note) => {
    const field = step.field;
    if (review && field) {
      if (words) return send({ message: words, spoken });
      return live
        ? send({ message: "Looks good", choice: { field, value: "ok" } })
        : onNext();
    }
    if (!live && !changed) return onNext();
    const pick: TurnRequest =
      sched && field
        ? {
            message: scheduleSummary(mode, sched),
            choice: {
              field,
              value: JSON.stringify({
                mode,
                ...sched,
                tz: sched.tz || browserTimeZone(),
              }),
            },
          }
        : socials && field
          ? {
              message: ticked.join(", "),
              choice: {
                field,
                value: JSON.stringify(
                  Object.fromEntries(
                    networks.map((n) => [n, socials[n].trim()]),
                  ),
                ),
              },
            }
          : draft.card && field
            ? {
                message: draft.card.label,
                choice: { field, value: draft.card.value },
              }
            : { message: ticked.join(", ") };
    send({ ...pick, message: withNote(pick.message, words), spoken });
  };
```

At line 232, change the "You said" guard from `step.answer && !typed && (` to `step.answer && step.answer !== typed && (`.

At line 269, change `selected={live ? undefined : step.answer}` to `selected={live ? undefined : step.answer?.split("\n")[0]}`, so a card sent with a note still shows as picked.

Replace the Continue label expression (lines 421-431) with:

```tsx
                        {review
                          ? note
                            ? "Send changes"
                            : review.status === "waiting"
                              ? "Continue"
                              : "Looks good, continue"
                          : !canContinue
                            ? multi
                              ? "Pick as many as fit"
                              : "Pick one to continue"
                            : !live && !changed
                              ? "Keep this answer"
                              : note && (ticked.length > 0 || draft.card)
                                ? "Continue with your note"
                                : multi && ticked.length > 1
                                  ? `Continue with ${ticked.length}`
                                  : "Continue"}
```

Replace the `AnswerBox` `onSubmit` (line 498) with:

```tsx
                  onSubmit={(text, spoken) =>
                    canContinue
                      ? proceed(spoken, text)
                      : send({ message: text, spoken })
                  }
```

Known limit, and fine for now: a note sent with a picked card is read for facts but never run as a site edit, because `run_turn` skips edits on choices (`interview.py:407`).

- [ ] **Step 6: Make Send an icon inside the box**

In `answer-box.tsx`, import `ArrowUp` from `lucide-react` and replace the Send `<Button>` (lines 90-99) with:

```tsx
      <Button
        type="submit"
        size="icon"
        aria-label="Send"
        title="Send"
        loading={sending}
        disabled={!text}
        className="size-9 shrink-0 rounded-full"
      >
        <ArrowUp className="size-4" aria-hidden />
      </Button>
```

- [ ] **Step 7: Typecheck and rerun**

Run: `docker compose exec nextjs-customer npm run typecheck && cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts src/components/setup-flow/__tests__/look-cards.test.ts`
Expected: no type errors; PASS.

- [ ] **Step 8: Commit (once the user has OK'd commits)**

```bash
git add -p frontend-customer/src/lib/interview.ts frontend-customer/src/lib/__tests__/interview.test.ts frontend-customer/src/components/setup-flow/question-screen.tsx frontend-customer/src/components/setup-flow/answer-box.tsx
git commit -m "fix(setup): Continue sends the picked tiles with the typed note"
```

---

### Task 2: The header stays put, and "Keep this look" moves on (N2, N3, N5 auto-open)

**Files:**
- Modify: `frontend-customer/src/components/setup-flow/setup-flow.tsx:127`
- Modify: `frontend-customer/src/components/setup-flow/look-cards.tsx:102-151` (props, auto-open), `:323-330` (`LookPreview` call), `:438-465` (`LookPreview` props, `keep`)
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx:264-277`
- Test: `frontend-customer/src/components/setup-flow/__tests__/look-cards.test.ts` (render helper only)

**Interfaces:**
- Consumes: `proceed()` from Task 1.
- Produces: a required `onKeep: () => void` prop on `LookCardsView` and `LookPreview`.

There is no unit test for this task. The bug is a scroll on an `overflow-hidden` ancestor, and the preview timer is an effect; `renderToStaticMarkup` runs neither. Task 12 checks both in the browser.

- [ ] **Step 1: Stop the shell from being a scroll container**

In `setup-flow.tsx:127`, change `"sf-shell relative isolate h-dvh overflow-hidden antialiased"` to `"sf-shell relative isolate h-dvh overflow-clip antialiased"`. `overflow: clip` clips the same way but is not a scroll container, so no `scrollIntoView` can move it.

- [ ] **Step 2: "Keep this look" sends the answer**

In `look-cards.tsx`:
- Add `onKeep: () => void;` to `LookCardsView`'s props type, and `onKeep` to its destructured args.
- Delete the auto-open: the `const [auto, setAuto] = useState…` line, the `setAuto(pick);` call, `const hasPreview = !!shown.preview;`, and the `useEffect` that calls `setTimeout(() => setPreview(auto), delay + 500)`. Keep the auto-select effect (`onPick(pick.value, …)`). Update its comment to: `// The guide's pick is selected the first time the coach lands on the question; tapping any look opens it as a page.`
- Pass `onKeep={onKeep}` where `<LookPreview` is rendered (line ~323).
- In `LookPreview`, add `onKeep: () => void` to the props, and replace the `keep` function and its comment (lines 459-466) with:

```tsx
  // Keeping the look is the answer: send it and move on.
  const keep = () => {
    onClose();
    onKeep();
  };
```

- [ ] **Step 3: Wire it in the question screen**

In `question-screen.tsx`, add `onKeep={() => proceed()}` to the `<LookCardsView` props. `proceed` sends `draft.card`; the tap that opened the preview already set it through `pickLook` → `onPick`.

- [ ] **Step 4: Update the test helper**

In `look-cards.test.ts`, add `onKeep: () => {},` to the props object in `render`.

- [ ] **Step 5: Typecheck and run**

Run: `docker compose exec nextjs-customer npm run typecheck && cd frontend-customer && npx vitest run src/components/setup-flow/__tests__/look-cards.test.ts`
Expected: no type errors; PASS.

- [ ] **Step 6: Commit (once OK'd)**

```bash
git add -p frontend-customer/src/components/setup-flow/setup-flow.tsx frontend-customer/src/components/setup-flow/look-cards.tsx frontend-customer/src/components/setup-flow/question-screen.tsx frontend-customer/src/components/setup-flow/__tests__/look-cards.test.ts
git commit -m "fix(setup): keeping a look answers the question; the header never scrolls away"
```

---

### Task 3: A slim sticky "Continue" bar while the real button is off-screen (N4)

**Files:**
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx` (imports; a ref on the action row at line 403; the bar at the end of the outer `div`)

**Interfaces:**
- Consumes: `proceed`, `canContinue`, `changed`, `ticked` and `draft.card` from Task 1.

There is no unit test (`IntersectionObserver` plus an effect). Task 12 checks it on the logo question at a 1280×836 viewport.

- [ ] **Step 1: Watch the real Continue row**

Add `useRef` to the `react` import and `ArrowRight` to the `lucide-react` import. After the `slow` effect, add:

```tsx
  // After a pick, a slim bar keeps Continue in reach while the real button
  // is scrolled out of view. The answer box itself stays in the page
  // (51d5301b took it out of a sticky footer on purpose).
  const actions = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  useEffect(() => {
    const el = actions.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) =>
      setOffscreen(!e.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const pickedLabel =
    draft.card?.label ??
    (ticked.length > 1 ? `${ticked.length} picked` : ticked[0]);
```

Put `ref={actions}` on the action row: `<div ref={actions} className="mt-6 flex min-h-11 flex-wrap items-center gap-2">`.

- [ ] **Step 2: Render the bar**

As the last child of the outermost `<div className="flex min-h-full flex-col">`, add:

```tsx
      {offscreen && canContinue && changed && !sending && !review && pickedLabel && (
        <div className="sticky bottom-4 z-20 mx-auto mb-4 flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border border-[var(--sf-line)] bg-white/95 py-1.5 pl-5 pr-1.5 shadow-[0_10px_24px_-14px_rgb(34_33_31/0.6)] backdrop-blur motion-safe:animate-[sf-rise_.3s_ease-out_both]">
          <span className="truncate text-[14px] font-medium">{pickedLabel}</span>
          <Button size="sm" onClick={() => proceed()} className="shrink-0 rounded-full px-4">
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `docker compose exec nextjs-customer npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit (once OK'd)**

```bash
git add -p frontend-customer/src/components/setup-flow/question-screen.tsx
git commit -m "feat(setup): a sticky Continue bar while the real one is off-screen"
```

---

### Task 4: AI suggestions stop inventing facts (G1)

**Files:**
- Modify: `backend/apps/tenant_config/interview_brief.py:28` (`FIXED_KINDS`), `:431-446` (`Field`), `:516` (story), `:517-522` (credentials), `:643-650` (contact), `:689-694` (`parse_price`)
- Modify: `backend/apps/tenant_config/interview.py:80-84` (`SYSTEM`), `:122-137` (`GUIDE_KEYS`), `:146-191` (`guide_for`)
- Modify: `frontend-customer/src/lib/setup-flow.ts` (`GuideTurn`), `frontend-customer/src/lib/interview.ts` (`questionSteps` carries `starter`; new `addStarter`)
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx` (tile click, check mark, "All of them"), `answer-box.tsx` (textarea `id`)
- Test: `backend/apps/tenant_config/tests/test_interview.py`, `backend/apps/tenant_config/tests/test_interview_brief.py`, `frontend-customer/src/lib/__tests__/interview.test.ts`

**Interfaces:**
- Produces: `Field.starter: bool`, the guide key `"starter": bool`, `GuideTurn.starter?: boolean`, and `addStarter(text: string, starter: string): string` in `@/lib/interview`.

- [ ] **Step 1: Write the failing backend tests**

Append to `test_interview_brief.py`:

```python
@pytest.mark.parametrize(
    ("raw", "price"),
    [
        ("29", 29.0),
        ("$15", 15.0),
        ("Free first class, then $15", 15.0),  # audit G1: was saved as free
        ("free", 0.0),
        ("Free for now", 0.0),
        ("Pay what you can", None),
        ("12,50", 12.5),
    ],
)
def test_parse_price_takes_the_number_over_free(raw, price):
    assert brief.parse_price(raw) == price
```

Append to `test_interview.py`:

```python
def test_prices_and_contact_keep_their_own_options_over_ai_ones():
    """Audit G1: the model offered "Free first class, then $15" and "Website live chat"."""
    from apps.tenant_config import interview_brief as brief

    answers = {"offers": ["course", "live"], "payments": ["course", "event"]}
    for field_id, junk in (
        ("contact", ["Website live chat", "Book a short video call"]),
        ("course_price", ["Free first class, then $15", "Pay what you can"]),
        ("event_price", ["Free first class, then $15", "Pay what you can"]),
    ):
        guide = interview.guide_for(brief.FIELD_BY_ID[field_id], "", "Q?", junk, ["mail", "coins"], answers)
        assert guide["options"] == list(brief.FIELD_BY_ID[field_id].options)


def test_story_and_credentials_offer_starters_not_claims():
    """Audit G1: one tap put an invented backstory on the About page."""
    from apps.tenant_config import interview_brief as brief

    assert interview.guide_for(brief.FIELD_BY_ID["story"], options=["I found yoga when…"], icons=[])["starter"]
    assert interview.guide_for(brief.FIELD_BY_ID["credentials"], options=["I trained in…"], icons=[])["starter"]
    assert interview.guide_for(brief.FIELD_BY_ID["pitch"], options=["Yoga for desks"], icons=[])["starter"] is False
    assert "starter" in interview.GUIDE_KEYS
    assert "sentence starters" in interview.SYSTEM
```

- [ ] **Step 2: Run them and check they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_brief.py::test_parse_price_takes_the_number_over_free apps/tenant_config/tests/test_interview.py::test_prices_and_contact_keep_their_own_options_over_ai_ones apps/tenant_config/tests/test_interview.py::test_story_and_credentials_offer_starters_not_claims -q`
Expected: FAIL. `"Free first class, then $15"` gives `0.0`; contact gets the AI options; there is no `starter` key.

- [ ] **Step 3: Implement the backend**

`interview_brief.py`:

```python
FIXED_KINDS = (
    "offers", "payments", "memberships", "schedule", "specialty", "calendar_nav", "socials", "price", "contact",
)
```

In `Field`, after `delegable`:

```python
    starter: bool = False  # options are sentence starters the coach finishes in the box, never answers
```

Story and credentials get `starter=True`:

```python
    Field("story", "Their story", "How did you come to teach this?", starter=True),
    Field(
        "credentials",
        "Training and experience",
        "Any training, certifications or years of teaching you'd like visitors to know about?",
        multi=True,
        starter=True,
    ),
```

Contact gets its own kind, so its options are fixed:

```python
        icons=("mail", "instagram", "message-circle", "phone", "pen-line"),
        kind="contact",
```

`parse_price`:

```python
def parse_price(raw) -> float | None:
    """A number wins over "free" ("Free first class, then $15" is 15); "free"
    alone is 0. ponytail: the first number wins ("2 free classes then 20" is
    2); fixed price tiles make that rare."""
    text = str(raw or "").lower()
    match = re.search(r"\d+(?:[.,]\d{1,2})?", text)
    if match:
        return min(float(match.group().replace(",", ".")), 9999.0)
    return 0.0 if "free" in text else None
```

`interview.py`, in `SYSTEM` step 3: replace `Open questions (their story, their pitch) get 8 too, written as the coach might say it.` with:

```
Open questions (their pitch) get 8 too, written as the coach might say it. For "story" and
     "credentials" write sentence starters the coach finishes in their own words ("I found yoga
     when…", "I trained in…"), never a finished claim: you do not know their story.
```

Add `"starter",` to `GUIDE_KEYS`. In `guide_for`, add `"starter": False,` to the `field is None` dict and `"starter": field.starter,` to the main dict.

- [ ] **Step 4: Run the backend tests and check they pass**

Run the command from Step 2, then `docker compose exec django pytest apps/tenant_config/tests/test_interview.py apps/tenant_config/tests/test_interview_brief.py -q`
Expected: PASS. If an existing test asserted AI options for `contact`, or `0.0` for a mixed price string, update it to the new contract.

- [ ] **Step 5: Write the failing frontend test**

In `interview.test.ts`, import `addStarter` and append:

```ts
describe("addStarter", () => {
  it("puts a starter in the box to finish, without its ellipsis", () => {
    expect(addStarter("", "I found yoga when…")).toBe("I found yoga when ");
    expect(addStarter("I trained in Bali. ", "200-hour training...")).toBe(
      "I trained in Bali. 200-hour training ",
    );
  });
});
```

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: FAIL, `addStarter` is not exported.

- [ ] **Step 6: Implement the frontend**

`lib/setup-flow.ts`, in `GuideTurn` after `socials`:

```ts
  /** The options are sentence starters: a tap puts one in the box to
   * finish, and it is never sent as-is. */
  starter?: boolean;
```

`lib/interview.ts`: add `starter` to both the destructuring and the object literal in `questionSteps`, and add:

```ts
/** A starter tile put in the answer box: appended without its trailing
 * "…", with a space to keep typing after. */
export const addStarter = (text: string, starter: string): string =>
  `${[text.trimEnd(), starter.replace(/\s*(…|\.\.\.)$/, "")].filter(Boolean).join(" ")} `;
```

`answer-box.tsx`: add `id="setup-answer"` to the `<textarea>`.

`question-screen.tsx`: import `addStarter`. Replace the tile `onClick` with:

```tsx
                        onClick={() => {
                          if (!step.starter)
                            return multi ? toggle(o) : setTicked(() => [o]);
                          onDraft((d) => ({
                            ...d,
                            text: addStarter(d.text ?? typed, o),
                          }));
                          requestAnimationFrame(() =>
                            document.getElementById("setup-answer")?.focus(),
                          );
                        }}
```

Then make these three changes:
- `aria-pressed={multi ? on : undefined}` becomes `aria-pressed={multi && !step.starter ? on : undefined}`.
- The check-circle block `{multi && (` becomes `{multi && !step.starter && (`.
- The "All of them" condition `multi && every.some(…)` becomes `multi && !step.starter && every.some(…)`.

A starter question can then continue only once the box has text: `ticked` stays empty, so Task 1's `canContinue` falls to `!!note`.

- [ ] **Step 7: Run, typecheck**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts && docker compose exec nextjs-customer npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit (once OK'd)**

```bash
git add -p backend/apps/tenant_config/interview_brief.py backend/apps/tenant_config/interview.py backend/apps/tenant_config/tests/test_interview.py backend/apps/tenant_config/tests/test_interview_brief.py frontend-customer/src/lib/setup-flow.ts frontend-customer/src/lib/interview.ts frontend-customer/src/lib/__tests__/interview.test.ts frontend-customer/src/components/setup-flow/question-screen.tsx frontend-customer/src/components/setup-flow/answer-box.tsx
git commit -m "fix(setup): fixed price and contact choices; story tiles are starters, not claims"
```

---

### Task 5: The plan price shows on paid choices, and offers explain themselves (Top 3, E1)

**Files:**
- Modify: `backend/apps/tenant_config/interview_golive.py` (add `PLAN_CHOICES`, `plan_badge`)
- Modify: `backend/apps/tenant_config/interview_brief.py` (`Field.why`; `why` on offers and payments; the `details` comment)
- Modify: `backend/apps/tenant_config/interview.py` (`GUIDE_KEYS`, `guide_for`, `run_turn`, `interview_state`)
- Modify: `frontend-customer/src/lib/setup-flow.ts` (`GuideTurn`), `frontend-customer/src/lib/interview.ts` (`questionSteps`, `planLabel`)
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx` (why line, plan badge, details always shown)
- Test: `backend/apps/tenant_config/tests/test_interview_golive.py`, `backend/apps/tenant_config/tests/test_interview.py`, `frontend-customer/src/lib/__tests__/interview.test.ts`

**Interfaces:**
- Produces: `interview_golive.plan_badge(tenant, field_id: str | None) -> dict | None`, shaped `{"id", "name", "amount_cents", "currency", "options": [str]}`. Guide keys `"why": str` and `"plan": dict | None`. `GuideTurn.why?: string`, `GuideTurn.plan?: PlanBadge | null`. `planLabel(plan): string` in `@/lib/interview`.

- [ ] **Step 1: Write the failing backend tests**

Append to `test_interview_golive.py`:

```python
def test_paid_choices_show_the_plan_before_go_live(tenant_ctx, config):
    """Audit Top 3: the $19.90 plan first appeared at go-live."""
    from apps.core.models import PlatformPlan
    from apps.tenant_config import interview_golive

    PlatformPlan.objects.update(is_active=False)
    PlatformPlan.objects.create(
        name="starter", price_monthly="19.90", transaction_fee_pct="0", prices={"USD": {"amount_cents": 1990}}
    )
    with mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=False):
        badge = interview_golive.plan_badge(tenant_ctx, "payments")
    assert badge["name"] == "starter" and badge["amount_cents"] == 1990 and badge["currency"] == "USD"
    assert "Monthly membership" in badge["options"] and "Free for now" not in badge["options"]
    # Review focus 4: a coach on a paid plan sees no badge.
    with mock.patch("apps.tenant_config.interview_golive.is_paid_active", return_value=True):
        assert interview_golive.plan_badge(tenant_ctx, "payments") is None
    assert interview_golive.plan_badge(tenant_ctx, "audience") is None
    # The badge labels are the tiles' own labels.
    for field_id, labels in interview_golive.PLAN_CHOICES.items():
        assert set(labels) <= set(brief.FIELD_BY_ID[field_id].options)
```

Append to `test_interview.py`:

```python
def test_offers_and_payments_say_why_they_matter():
    """Audit E1: the offers question decides about 10 later questions and nothing said so."""
    from apps.tenant_config import interview_brief as brief

    assert "pages" in interview.guide_for(brief.FIELD_BY_ID["offers"])["why"]
    assert interview.guide_for(brief.FIELD_BY_ID["payments"])["why"]
    assert interview.guide_for(brief.FIELD_BY_ID["pitch"], options=["x"], icons=[])["why"] == ""
    assert {"why", "plan"} <= set(interview.GUIDE_KEYS)
```

- [ ] **Step 2: Run them and check they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_golive.py::test_paid_choices_show_the_plan_before_go_live apps/tenant_config/tests/test_interview.py::test_offers_and_payments_say_why_they_matter -q`
Expected: FAIL. `plan_badge` doesn't exist and there is no `why` key.

- [ ] **Step 3: Implement the backend**

`interview_golive.py`, after `_starter_plan`:

```python
# The choices that need a paid plan, by question: classes need it to run,
# and selling needs it at all.
PLAN_CHOICES = {
    "offers": ("Live online classes", "In-person sessions"),
    "payments": ("One-time course purchases", "Monthly membership", "Pay per class or event"),
}


def plan_badge(tenant, field_id) -> dict | None:
    """The plan a question's paid choices need, shown on those tiles before
    the coach picks (it used to appear first at go-live). None once they
    have it."""
    labels = PLAN_CHOICES.get(field_id or "")
    if not labels:
        return None
    covered = _live_entitled(tenant) if field_id == "offers" else is_paid_active(tenant)
    plan = None if covered else _starter_plan(tenant)
    return {**plan, "options": list(labels)} if plan else None
```

`interview_brief.py`, in `Field` after `starter`:

```python
    why: str = ""  # one line under the question: why it matters
```

Change the `details` comment to `# one description per option, shown under it`. On the offers field add `why="This decides which pages I build and what I ask you next.",` and on payments `why="Free stays free. You can change prices any time.",`.

`interview.py`:
- Add `"why", "plan",` to `GUIDE_KEYS`.
- In `guide_for`, add `"why": "",` and `"plan": None,` to the `field is None` dict, and `"why": field.why,` to the main dict.
- Add `from . import interview_golive` to the local imports at the top of `run_turn` and of `interview_state`, next to `from . import interview_milestones as milestones`.
- In `run_turn`, right after `if note := started_note(fired): guide["status"] = note`, before `mutate` stores the guide in the transcript, add:

```python
    guide["plan"] = interview_golive.plan_badge(tenant, guide["field"])
```

- In `interview_state`, just before `guide["cards"] = milestones.cards_for(…)`, add:

```python
    guide["plan"] = interview_golive.plan_badge(tenant, guide["field"])  # live: a plan bought since hides it
```

- [ ] **Step 4: Run the backend tests and check they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview.py apps/tenant_config/tests/test_interview_golive.py -q`
Expected: PASS. The `quiet` fixture doesn't mock `plan_badge`; it reads the DB, which is fine in tests.

- [ ] **Step 5: Write the failing frontend test**

In `interview.test.ts`, import `planLabel` and append:

```ts
describe("planLabel", () => {
  it("names the plan and its monthly price", () => {
    expect(
      planLabel({ name: "starter", amount_cents: 1990, currency: "usd" }),
    ).toBe("Starter plan · $19.90/mo");
    expect(planLabel({ name: "pro", amount_cents: null, currency: "EUR" })).toBe(
      "Pro plan",
    );
  });
});
```

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: FAIL, `planLabel` is not exported.

- [ ] **Step 6: Implement the frontend**

`lib/setup-flow.ts`, in `GuideTurn`:

```ts
  /** One line under the question: why it matters. */
  why?: string;
  /** The plan the listed paid options need, shown on their tiles. */
  plan?: PlanBadge | null;
```

and above `GuideTurn`:

```ts
export interface PlanBadge {
  name: string;
  amount_cents: number | null;
  currency: string;
  options: string[];
}
```

`lib/interview.ts`: add `why` and `plan` to `questionSteps`' destructuring and object literal, and add next to `formatPrice`:

```ts
/** "Starter plan · $19.90/mo": the plan a paid choice needs. */
export function planLabel(plan: {
  name: string;
  amount_cents: number | null;
  currency: string;
}): string {
  const name = plan.name.charAt(0).toUpperCase() + plan.name.slice(1);
  const price = formatPrice(plan.amount_cents, plan.currency);
  return price ? `${name} plan · ${price}/mo` : `${name} plan`;
}
```

`question-screen.tsx`, importing `planLabel`:
- Right after the `</h1>`:

```tsx
              {step.why && (
                <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--sf-graphite)]">
                  {step.why}
                </p>
              )}
```

- Replace the whole unfolding `{step.details?.[o] && ( … )}` block with an always-visible line:

```tsx
                        {step.details?.[o] && (
                          <span
                            className={cn(
                              "text-[12.5px] font-normal leading-snug",
                              multi && "pr-7",
                              on ? "opacity-80" : "text-[var(--sf-graphite)]",
                            )}
                          >
                            {step.details[o]}
                          </span>
                        )}
```

- Right after it, the plan badge:

```tsx
                        {step.plan?.options.includes(o) && (
                          <span
                            className={cn(
                              "mt-0.5 w-fit rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                              on
                                ? "bg-[rgb(255_255_255/0.15)]"
                                : "bg-[var(--sf-tint-strong)] text-[var(--sf-graphite)]",
                            )}
                          >
                            {planLabel(step.plan)}
                          </span>
                        )}
```

Update the `details` doc comment in `GuideTurn` to "shown under it".

- [ ] **Step 7: Run, typecheck**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts && docker compose exec nextjs-customer npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit (once OK'd)**

```bash
git add -p backend/apps/tenant_config/interview_golive.py backend/apps/tenant_config/interview_brief.py backend/apps/tenant_config/interview.py backend/apps/tenant_config/tests/test_interview.py backend/apps/tenant_config/tests/test_interview_golive.py frontend-customer/src/lib/setup-flow.ts frontend-customer/src/lib/interview.ts frontend-customer/src/lib/__tests__/interview.test.ts frontend-customer/src/components/setup-flow/question-screen.tsx
git commit -m "feat(setup): paid choices show the plan they need; offers say why they matter"
```

---

### Task 6: Drafts always end ready or failed, never "building" forever (R1)

**Files:**
- Modify: `backend/apps/tenant_config/interview_milestones.py:230-264` (`run_draft`)
- Modify: `frontend-customer/src/components/setup-flow/draft-review.tsx` (stuck timeout, `onRetry`)
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx:255-262` (pass `onRetry`), `:491-497` (placeholder)
- Test: `backend/apps/tenant_config/tests/test_interview_milestones.py`

**Interfaces:**
- Produces: a required `onRetry: () => void` prop on `DraftReview`.

- [ ] **Step 1: Write the failing backend tests**

Append to `test_interview_milestones.py`:

```python
def test_a_crash_while_drafting_marks_the_draft_failed(tenant_ctx, config, owner):
    """Audit R1: any error, not only AI and content ones, ends the spinner."""
    with (
        mock.patch("apps.tenant_config.setup_flow.create_draft", side_effect=KeyError("days")),
        pytest.raises(KeyError),
    ):
        ms.run_draft(tenant_ctx, "event", "prompt")
    assert TenantConfig.objects.first().setup_flow["draft_status"]["event"] == "failed"


def test_a_crash_after_the_draft_exists_keeps_it_ready(tenant_ctx, config, owner):
    """Review focus 3: the draft is there (the stale-worker KeyError hit in
    apply_schedule), so the coach reviews it instead of a failure."""
    with (
        mock.patch("apps.tenant_config.setup_flow.create_draft"),
        mock.patch.object(ms, "apply_schedule", side_effect=KeyError("days")),
        pytest.raises(KeyError),
    ):
        ms.run_draft(tenant_ctx, "event", "prompt")
    assert TenantConfig.objects.first().setup_flow["draft_status"]["event"] == "ready"
```

- [ ] **Step 2: Run them and check they fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_milestones.py -k "crash" -q`
Expected: FAIL. `draft_status` has no `event` key, so the status is never written.

- [ ] **Step 3: Implement `run_draft`**

Replace `run_draft`'s body (lines 230-264) with:

```python
def run_draft(tenant, kind: str, prompt: str, keep_cover: bool = False) -> None:
    """AI draft, else the deterministic fallback. Inside tenant_context. With
    ``keep_cover`` the new draft takes the cover the old one had. Whatever
    happens, the status ends ready (the draft exists) or failed: a review
    screen never waits on a draft that will not come."""
    from apps.accounts.models import User
    from apps.core import ai as core_ai
    from apps.core.copilot.content import ContentOpError

    from . import setup_flow

    status = "failed"
    try:
        old = _draft_row(TenantConfig.objects.first().setup_flow or {}, kind) if keep_cover else None
        cover = (
            (old.thumbnail, old.thumbnail_url) if old is not None and (old.thumbnail_id or old.thumbnail_url) else None
        )
        owner = User.objects.filter(role="owner").order_by("id").first()
        try:
            # Background priority: the coach's next interview question must not
            # queue behind a draft on the shared hub.
            setup_flow.create_draft(tenant, owner, kind, prompt, label="contentor:compose-draft")
        except (core_ai.AiError, ContentOpError):
            logger.warning("interview draft fell back schema=%s kind=%s", tenant.schema_name, kind, exc_info=True)
            try:
                setup_flow.create_fallback_draft(tenant, owner, kind, brief.answers_of(tenant))
            except ContentOpError:
                logger.exception("interview fallback draft failed schema=%s kind=%s", tenant.schema_name, kind)
                return
        status = "ready"
        if cover is not None:
            item = _draft_row(TenantConfig.objects.first().setup_flow or {}, kind)
            if item is not None:
                item.thumbnail, item.thumbnail_url = cover
                item.save(update_fields=["thumbnail", "thumbnail_url"])
        if kind == "event":
            apply_schedule(tenant)
    finally:
        _set_draft_status(tenant, kind, status)
    if kind == "course":
        grant_membership(tenant)
        setup_flow.start_page_build(tenant, "courses")
```

Unexpected errors still propagate, so Celery logs them. The `finally` only guarantees the status is written.

- [ ] **Step 4: Run the milestone tests and check they pass**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_milestones.py -q`
Expected: PASS, including `test_run_draft_falls_back_when_ai_fails` and `test_interview_background_ai_runs_behind_the_coach`.

- [ ] **Step 5: Add the browser-side timeout**

There is still a hole: a worker killed mid-task (OOM, restart) never reaches `finally`. In `draft-review.tsx`:
- Import `useEffect`, `useState` from `react` (merge with the existing import) and `Button` from `@/components/ui/button` if it isn't imported yet.
- Add `onRetry: () => void` to `DraftReview`'s props.
- At the top of `DraftReview`'s body, before any early return:

```tsx
  // A draft still building after two minutes is stuck (a worker restart can
  // strand it): offer to start it again instead of spinning forever.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    setStuck(false);
    if (card.status !== "building") return;
    const t = setTimeout(() => setStuck(true), 120_000);
    return () => clearTimeout(t);
  }, [card.status]);
```

- Right after it, still before the existing early returns:

```tsx
  if (stuck)
    return (
      <div
        role="status"
        className="mt-8 max-w-[60ch] rounded-2xl border border-[var(--sf-line)] bg-white px-5 py-4 text-[15px] leading-relaxed text-[var(--sf-graphite)] motion-safe:animate-[sf-pop_.7s_var(--sf-spring)_both]"
      >
        <p>
          Your {NOUN[card.kind]} is taking much longer than it should. Try
          again, or skip it for now and add it later.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onRetry}
          className="mt-3 rounded-full"
        >
          Try again
        </Button>
      </div>
    );
```

"Skip it for now" points at the section's existing skip button ("No class for now") in the action row.

- [ ] **Step 6: Wire retry and fix the hint**

In `question-screen.tsx`, pass `onRetry={() => send({ message: "Draft it again from scratch" })}` to `<DraftReview`. Words on a review screen redraft it; "from scratch" matches `_WHOLE_WORDS`, so it is a full redraft. After the send, the transcript grows, so the screen remounts with a fresh timer.

Make the review placeholder fit the kind ("make it six weeks" is a course example):

```tsx
                    review
                      ? `Or tell me what to change, like ${
                          review.kind === "course"
                            ? "“make it six weeks”"
                            : "“make it an hour long”"
                        } or “another photo”…`
```

"Redrafting…" stays: once the backend fix lands it only shows on a real redraft.

- [ ] **Step 7: Typecheck**

Run: `docker compose exec nextjs-customer npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit (once OK'd)**

```bash
git add -p backend/apps/tenant_config/interview_milestones.py backend/apps/tenant_config/tests/test_interview_milestones.py frontend-customer/src/components/setup-flow/draft-review.tsx frontend-customer/src/components/setup-flow/question-screen.tsx
git commit -m "fix(setup): a draft always ends ready or failed; a stuck one offers Try again"
```

---

### Task 7: Errors say what went wrong, and handles are checked while typing (R2)

**Files:**
- Modify: `backend/apps/tenant_config/interview_milestones.py:757-768` (socials branch of `choose`)
- Modify: `frontend-customer/src/lib/interview.ts` (add `socialOk`), `frontend-customer/src/lib/setup-flow.ts` (add `turnErrorText`)
- Modify: `frontend-customer/src/components/setup-flow/setup-flow.tsx:298-330` (`send` error handling)
- Modify: `frontend-customer/src/components/setup-flow/socials-picker.tsx` (inline error), `question-screen.tsx` (`canContinue` for socials)
- Test: `backend/apps/tenant_config/tests/test_interview_milestones.py`, `backend/apps/tenant_config/tests/test_interview_brief.py`, `frontend-customer/src/lib/__tests__/interview.test.ts`

**Interfaces:**
- Produces: `ChoiceError("invalid_handle")`. `socialOk(network: string, raw: string): boolean` in `@/lib/interview`. `turnErrorText(err: unknown): string` in `@/lib/setup-flow`.

- [ ] **Step 1: Write the failing backend tests**

In `test_interview_milestones.py`, in `test_calendar_and_social_choices_are_validated`, change the socials `pytest.raises(ms.ChoiceError)` to `pytest.raises(ms.ChoiceError, match="invalid_handle")`, and add below it:

```python
    with pytest.raises(ms.ChoiceError, match="invalid_handle"):
        ms.choose(tenant_ctx, answers, "socials", '{"Instagram": "mira yoga house"}')  # audit R2
```

Append to `test_interview_brief.py`, the server half of Review Focus 5 (the same table as Step 5's vitest):

```python
@pytest.mark.parametrize(
    ("network", "raw", "ok"),
    [
        ("instagram", "@mira.yoga", True),
        ("instagram", "mira yoga house", False),
        ("instagram", "https://www.instagram.com/mira.yoga/?hl=en", True),
        ("youtube", "youtu.be/abc", True),
        ("x", "twitter.com/mira", True),
        ("tiktok", "", False),
        ("instagram", "mira.yoga.", True),
    ],
)
def test_social_url_table_the_browser_mirrors(network, raw, ok):
    assert (brief.social_url(network, raw) is not None) is ok
```

- [ ] **Step 2: Run them and check the first fails**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_milestones.py::test_calendar_and_social_choices_are_validated apps/tenant_config/tests/test_interview_brief.py -k "social" -q`
Expected: the milestones test FAILS (`invalid_value` is not `invalid_handle`). The table passes already, since it pins current behaviour.

- [ ] **Step 3: Implement the backend**

In `choose`, socials branch: change `if picked and not links: raise ChoiceError("invalid_value")` to `raise ChoiceError("invalid_handle")`. Leave the non-dict `invalid_value` as is.

Rerun the Step 2 command. Expected: PASS.

- [ ] **Step 4: Write the failing frontend tests**

In `interview.test.ts`, import `socialOk`, plus `turnErrorText` from `@/lib/setup-flow` and `ApiError` from `@/types/api`, then append:

```ts
describe("socialOk mirrors the server", () => {
  it.each([
    ["Instagram", "@mira.yoga", true],
    ["Instagram", "mira yoga house", false],
    ["Instagram", "https://www.instagram.com/mira.yoga/?hl=en", true],
    ["YouTube", "youtu.be/abc", true],
    ["X", "twitter.com/mira", true],
    ["TikTok", "", false],
    ["Instagram", "mira.yoga.", true],
  ] as const)("%s %s", (network, raw, ok) => {
    expect(socialOk(network, raw)).toBe(ok);
  });
});

describe("turnErrorText", () => {
  it("names a refused handle and falls back for anything else", () => {
    expect(
      turnErrorText(new ApiError(400, { detail: "invalid_handle" })),
    ).toMatch(/handle/);
    expect(turnErrorText(new Error("offline"))).toMatch(/didn’t go through/);
  });
});
```

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: FAIL, neither function is exported.

- [ ] **Step 5: Implement the frontend helpers**

`lib/interview.ts`:

```ts
// Mirrors interview_brief.SOCIALS / social_url (pinned by the same table in
// test_interview_brief.py): a handle, or a link on that network.
const SOCIAL_HOSTS: Record<string, string> = {
  instagram: "instagram\\.com",
  youtube: "youtube\\.com|youtu\\.be",
  tiktok: "tiktok\\.com",
  facebook: "facebook\\.com|fb\\.com",
  x: "x\\.com|twitter\\.com",
  linkedin: "linkedin\\.com",
};

/** Whether the server will take this handle or link for a network ("Instagram"). */
export function socialOk(network: string, raw: string): boolean {
  const host = SOCIAL_HOSTS[network.toLowerCase()];
  const text = raw.trim().replace(/[.,;]+$/, "");
  if (!host || !text) return false;
  return (
    new RegExp(`^(?:https?://)?(?:[\\w-]+\\.)?(?:${host})/\\S{1,200}$`, "i").test(text) ||
    /^@?[\p{L}\p{N}_.-]{1,60}$/u.test(text)
  );
}
```

`lib/setup-flow.ts` (import `ApiError` from `@/types/api`):

```ts
/** A refused answer (the server's 400 detail code), in the coach's words. */
const CHOICE_ERRORS: Record<string, string> = {
  invalid_handle:
    "That handle doesn’t look right. Use your handle, like @mira.yoga, or paste the link to your profile.",
  invalid_schedule: "Pick at least one day and a time for the class.",
  unknown_logo: "That logo isn’t available any more. Pick another one.",
  unknown_style: "That look isn’t available any more. Pick another one.",
};

export function turnErrorText(err: unknown): string {
  const code =
    err instanceof ApiError && err.status === 400
      ? String(err.data.detail ?? "")
      : "";
  return (
    CHOICE_ERRORS[code] ??
    "That didn’t go through. Your answer is still here, so try again in a moment."
  );
}
```

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: PASS.

- [ ] **Step 6: Use them**

`setup-flow.tsx`: import `turnErrorText`. In the `send` `useAsyncAction` options, replace `{ errorToast: "That didn’t go through. Your answer is still in the box." }` with `{ onError: (err) => toast.error(turnErrorText(err)) }`.

`question-screen.tsx`: import `socialOk`, and in `canContinue` change `networks.every((n) => !!socials[n]?.trim())` to `networks.every((n) => socialOk(n, socials[n] ?? ""))`.

`socials-picker.tsx`: import `socialOk` from `@/lib/interview`, and in the `networks.map` body:

```tsx
      {networks.map((n) => {
        const bad = !!value[n]?.trim() && !socialOk(n, value[n]);
        return (
          <label key={n} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[var(--sf-graphite)]">
              {n}
            </span>
            <input
              type="text"
              value={value[n] ?? ""}
              disabled={disabled}
              placeholder="@yourname or a link"
              autoComplete="off"
              aria-invalid={bad || undefined}
              aria-describedby={bad ? `social-${n}-error` : undefined}
              onChange={(e) => onChange({ ...value, [n]: e.target.value })}
              className={INPUT}
            />
            {bad && (
              <span
                id={`social-${n}-error`}
                className="text-[12.5px] text-destructive"
              >
                No spaces: use your handle, like @mira.yoga, or paste the link.
              </span>
            )}
          </label>
        );
      })}
```

- [ ] **Step 7: Typecheck and run**

Run: `docker compose exec nextjs-customer npm run typecheck && cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: no errors; PASS.

- [ ] **Step 8: Commit (once OK'd)**

```bash
git add -p backend/apps/tenant_config/interview_milestones.py backend/apps/tenant_config/tests/test_interview_milestones.py backend/apps/tenant_config/tests/test_interview_brief.py frontend-customer/src/lib/interview.ts frontend-customer/src/lib/setup-flow.ts frontend-customer/src/lib/__tests__/interview.test.ts frontend-customer/src/components/setup-flow/setup-flow.tsx frontend-customer/src/components/setup-flow/socials-picker.tsx frontend-customer/src/components/setup-flow/question-screen.tsx
git commit -m "fix(setup): refused answers say why; social handles are checked as typed"
```

---

### Task 8: "Already set up" after verifying gets its login button (R3)

**Files:**
- Modify: `frontend-main/src/app/signup/verify/page.tsx:195-209`

The `closedCta` string ("Go to login") already exists in `frontend-main/messages/en/auth.json:66`; nothing uses it. Login lives at `/login` (`frontend-main/src/app/(auth)/login`). This is static JSX, so there is no unit test; typecheck covers it, and Task 12 covers it in the browser if a stale link is at hand.

- [ ] **Step 1: Add the button**

In the `resumeState === "sent" || resumeState === "closed"` branch, after `</StateIcon>`:

```tsx
          {resumeState === "closed" && (
            <Button asChild size="lg" className="mt-7 w-full">
              <a href="/login">{r("closedCta")}</a>
            </Button>
          )}
```

- [ ] **Step 2: Typecheck**

Run: `docker compose exec nextjs-main npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit (once OK'd)**

```bash
git add -p frontend-main/src/app/signup/verify/page.tsx
git commit -m "fix(signup): the already-set-up screen links to login"
```

---

### Task 9: Look filters show only tags that fit the coach (G3)

**Files:**
- Modify: `frontend-customer/src/components/setup-flow/look-cards.tsx:179-184` (chips)
- Modify: `frontend-customer/src/lib/site-styles.ts:12-21` (`STYLE_TAGS` labels)
- Test: `frontend-customer/src/components/setup-flow/__tests__/look-cards.test.ts`

Note: `STYLE_TAGS` and the style `tags` are part of the uncommitted 2026-10-09 work (see "Before Task 1").

- [ ] **Step 1: Write the failing test**

Append to `look-cards.test.ts`:

```ts
describe("LookCardsView tag chips", () => {
  it("offers only tags the best-ranked looks carry", () => {
    const options = Array.from({ length: 10 }, (_, i) => ({
      ...look(`s${i}`, `g${i}`, i === 0),
      tags: i === 0 ? ["selling"] : i === 9 ? ["sexy"] : [],
    }));
    const html = renderToStaticMarkup(
      createElement(LookCardsView, {
        cards: { kind: "style", options },
        brandName: "",
        disabled: false,
        onPick: () => {},
        onKeep: () => {},
        onMore: async () => ({ kind: "style", options }),
      }),
    );
    expect(html).toContain("Made to sell");
    expect(html).not.toContain("Sexy");
  });
});
```

- [ ] **Step 2: Run it and check it fails**

Run: `cd frontend-customer && npx vitest run src/components/setup-flow/__tests__/look-cards.test.ts`
Expected: FAIL. The label is still "Selling" and "Sexy" is offered.

- [ ] **Step 3: Implement**

`look-cards.tsx`, replacing the `chips` const:

```tsx
    // Only tags the best-ranked looks carry (ranked by niche and tone), so a
    // desk-yoga coach is never offered "Sexy".
    const fits = shown.options.slice(0, 8);
    const chips: [string, string][] = [
      ["", "All"],
      ...STYLE_TAGS.filter(([t]) => fits.some((o) => o.tags?.includes(t))),
    ];
```

`site-styles.ts`, plain-word labels (ids unchanged):

```ts
export const STYLE_TAGS: [tag: string, label: string][] = [
  ["selling", "Made to sell"],
  ["expertise", "Shows expertise"],
  ["short", "Short page"],
  ["long", "Long page"],
  ["sensual", "Sensual"],
  ["confident", "Confident"],
  ["sexy", "Sexy"],
  ["playful", "Playful"],
];
```

- [ ] **Step 4: Run it and check it passes**

Run: `cd frontend-customer && npx vitest run src/components/setup-flow/__tests__/look-cards.test.ts src/lib/__tests__/site-styles.test.ts`
Expected: PASS. If `site-styles.test.ts` asserts the old labels, update it.

- [ ] **Step 5: Commit (once OK'd)**

```bash
git add -p frontend-customer/src/components/setup-flow/look-cards.tsx frontend-customer/src/lib/site-styles.ts frontend-customer/src/components/setup-flow/__tests__/look-cards.test.ts
git commit -m "fix(setup): look filters only offer tags that fit the coach"
```

---

### Task 10: An honest time estimate, and a word on what typing does (P1 copy, E3)

**Files:**
- Modify: `backend/apps/tenant_config/interview.py:28` (`OPENING_ACK`)
- Modify: `frontend-main/messages/en/auth.json:4` (signup subtitle)

Copy only. The existing tests reference `interview.OPENING_ACK` by name, so they keep passing. Section-based progress and reasons for the count jumping are in Phase 2.

- [ ] **Step 1: Change the copy**

`interview.py`:

```python
OPENING_ACK = (
    "Hi. This takes about 15 minutes, and your site builds while we talk. Tap an answer, type, or use the mic."
    " Tell me a lot at once and I'll skip what you've covered."
)
```

`auth.json` line 4: `"subtitle": "Start your free Contentor platform. Your site is ready in about 15 minutes.",`

- [ ] **Step 2: Run the interview tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview.py -q`
Expected: PASS.

- [ ] **Step 3: Commit (once OK'd)**

```bash
git add -p backend/apps/tenant_config/interview.py frontend-main/messages/en/auth.json
git commit -m "copy(setup): say it takes about 15 minutes, and that typing skips questions"
```

---

### Task 11: Turns stop re-sending the whole transcript (F1, latency part)

**Files:**
- Modify: `backend/apps/tenant_config/interview.py:26-27` (`CONTEXT_TURNS`)
- Test: `backend/apps/tenant_config/tests/test_interview.py`

The facts already travel in `"answered"`; `"recent"` only carries the flow of the conversation. The audit measured turns slowing from about 7 s to about 15 s as the transcript grew to 80. `TRANSCRIPT_KEEP` (what going back can show) stays 80.

- [ ] **Step 1: Write the failing test**

Add `import json` to `test_interview.py`'s imports, and append:

```python
def test_only_the_last_turns_ride_along(tenant_ctx, config):
    """Audit F1: turns slowed from ~7 s to ~15 s as all 80 turns rode every call."""
    turns = [{"role": "coach", "text": f"m{i}"} for i in range(40)]
    recent = json.loads(interview._user_turn(tenant_ctx, {}, turns, "hi", False))["recent"]
    assert len(recent) == interview.CONTEXT_TURNS < 40
    assert recent[-1]["text"] == "m39"
```

- [ ] **Step 2: Run it and check it fails**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview.py::test_only_the_last_turns_ride_along -q`
Expected: FAIL, 40 turns are sent.

- [ ] **Step 3: Implement**

```python
# The facts ride in "answered"; the last few turns are enough for the flow
# of the talk. All 80 made late turns about twice as slow (audit 2026-10-09).
CONTEXT_TURNS = 8
```

- [ ] **Step 4: Run it and check it passes**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview.py -q`
Expected: PASS.

- [ ] **Step 5: Commit (once OK'd)**

```bash
git add -p backend/apps/tenant_config/interview.py backend/apps/tenant_config/tests/test_interview.py
git commit -m "perf(setup): send the last 8 turns, not all 80, with each interview call"
```

---

### Task 12: Walk the flow as a new coach, time it, run the full gates

**Files:** none (verification).

- [ ] **Step 1: Stack up, worker fresh**

Run: `make health-check`, then `docker compose restart celery-worker`. A worker started before a code change drafts with stale code; that is how the audit hit `KeyError('days')`.

- [ ] **Step 2: Sign up a fresh coach**

On `http://localhost/signup`, use a new name (for example "Mira Yoga House 2"), selling live classes, a community and memberships. Read the verify link with `curl -s 'http://localhost/api/v1/dev/emails/latest/?to=<email>'`. Open DevTools → Network, filtered to `turn/`.

- [ ] **Step 3: Check every fixed finding on the way**

| Check | Pass when |
|---|---|
| N1 | On "Who do you teach?", tick a tile, type "mostly women over 40 with back pain", press "Continue with your note". `docker compose exec -T django python manage.py shell -c "from apps.core.models import Tenant; print(Tenant.objects.filter(name__icontains='mira yoga house 2').first().wizard_state['answers'].get('audience'))"` shows both. |
| Review focus 1 | Press ← back to that question: the tile is ticked, the note is in the box, and the button says "Keep this answer". |
| E1, Top 3 | Offers shows every description and the "why" line. Live and in-person tiles carry "Starter plan · $…/mo"; so do the paid payment tiles. |
| N3, N2 | On the look question nothing opens by itself. Tap a look, then "Keep this look": the next question appears and `document.querySelector('.sf-shell').scrollTop === 0` in the console. The header (progress, Back) is visible for the rest of setup. |
| N4 | On the logo question at a 1280×836 window, pick a logo: the sticky bar shows the logo name. Scroll to the real Continue and the bar hides. |
| G1 | Story and credentials tiles fill the box, and nothing sends until you type. Prices and contact show the fixed tiles. |
| R2 | Instagram "mira yoga house" shows the inline error, and Continue stays disabled. |
| R1 | `docker compose stop celery-worker` before the class review. It shows "Drafting…", and after 2 minutes "Try again". Then `docker compose start celery-worker`, press "Try again", and the class draft arrives. |
| Review focus 2 | On the class review, type "make it an hour long": the button reads "Send changes", and pressing it redrafts instead of approving. |
| F1 | Note every `turn/` duration. The median should be well under the audit's 14.3 s, with no climb from about 7 s to about 15 s late in setup. Report the numbers. |
| R3 | If an old verify link for a completed signup is at hand, "Email me a new link" leads to "Go to login". Otherwise say it was skipped. |

- [ ] **Step 4: Full gates, one at a time**

Run, sequentially: `make test`, `make test-frontend`, `make typecheck`, `make lint`, then `make e2e-changed`.
Expected: all pass. If any fail, report them with output; do not claim done.

- [ ] **Step 5: Update memory**

Update `contentor-setup-ux-audit-2026-10-09.md`: Phase 1 fixed (commit SHAs, or "uncommitted"), the measured turn median, and what is left (Phases 2 and 3 below).

---

## Phase 2: Next (separate plans; each needs a design call first)

**2A. Instant transitions (F1, Top 4).** Cheap first step: on a pure tap (a choice with no note) whose next field is code-owned (`CARD_KINDS`, `FIXED_KINDS` or hinted), skip `_ask_ai` and serve the pre-written question at once. Today every tap waits for the model, for example the 15 s calendar-layout pick (`interview.py:386`). Then prefetch the next question's options while the coach reads. After that, confirm instead of ask: draft the pitch, tone and settings from earlier answers and show one "Here's what I've got, fix anything" screen. Decide: who writes the ack on skipped turns (code, or nobody), and how `tone_hints` still get written.

**2B. Respect the coach's offers (R5, Top 5).** `_sync_legacy` stops forcing `course` (`interview_brief.py:849`). Add `needs=("course",)` to `course_topic`, `course_price`, `course_review`. Payments hides "One-time course purchases" without courses. Review `tiers_for`'s `["course"]` default and `make_free`'s `or "course"` fallback. Hero and CTA hrefs stop defaulting to `/courses` (`site_composer.py:237,406,1146-1149`; `compose.py:72,91,116,168`; `defaults.py:208-241`). `sync_site` removes the Events link when the class section is skipped (it is add-only today). Membership perks follow the offers ("every live class" without classes). Go-live flags nav links to empty pages.

**2C. Go-live honesty (R6, P2, P3, Top 6).** Show a confirm dialog that lists exactly what "make it free" changes (`golive_state` returns the effects; `make_free` at `interview_golive.py:80`). Add "Publish now, sell later": paid items stay drafts and free content goes live, with no plan required. Add a 3-step checklist with time estimates and a summary (pages, memberships, class time, prices). Say "Almost ready: Contact page still building" and open the preview on Home.

**2D. Show the site early (E4).** When Home is ready, show a "Your home page is ready: peek" chip that opens a drawer with the existing `BrowserFrame`, while the questions continue.

**2E. Progress by section (P1 rest, P4).** Sections: You · Students · Offer · Look · Pricing · Contact. Give a reason when the count jumps ("live classes add 4 questions"). Use one sequence from signup: Account → Your site → Go live.

**2F. Quick wins (XS–S, no design needed):** N5 phone-width look preview with the name and reason visible; F3 "All of them" only on offers and payments; E2 "Pick for me", plus a reply that says what was picked; E3 a "Noted: your story · your training" chip from the facts a turn applied; G2 WhatsApp number and signup email prefill (the socials-picker pattern); G6 schedule defaults to next week, and the review says "repeats Tue & Thu"; F2 default the calendar layout and navbar (drop two questions, list them in the go-live summary); F4 header menu (Saved automatically · Finish later · Help · Sign out); R4 address preview under the brand field ("the address can't change"); F5 signup copy; V2 tile details; V3 phones (24 px colour dots, the building status line, a home thumbnail at go-live).

## Phase 3: Later

- G4 logo preview as mark plus name in the chosen look's colours, and an upload option. Coordinate with the uncommitted `docs/superpowers/plans/2026-10-09-ai-logo-generation.md`.
- G5 membership prices editable on the card, in the coach's currency (today `$` is hard-coded in `options_for` and `composer_facts`).
- V1 one visual style from signup through setup.
- Funnel tracking: drop-off and time per question, the "You decide" rate, typed vs. tapped answers, and turn latency. Then the open PRODUCT.md item: a non-technical coach tries it unaided.
