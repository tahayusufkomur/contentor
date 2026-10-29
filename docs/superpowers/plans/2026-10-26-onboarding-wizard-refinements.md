# Onboarding wizard: prompts for future agents

Each prompt below stands on its own. Paste one into a fresh agent session.

**Shared rules (add these to every prompt):**
> Repo: `contentor`. The onboarding wizard ("setup flow") frontend is in `frontend-customer/src/components/setup-flow/`. The interview backend is in `backend/apps/tenant_config/` (`interview*.py`, `setup_flow*.py`). Content drafting ("focus mode") is in `backend/apps/core/focus/`. Follow `AGENTS.md`: run GitNexus `impact` before you edit any symbol, and run `detect_changes` before you commit. Keep the change small. Match the existing style. Add or update tests. Before you claim it works, check it in the browser with the dev setup.

---

## 1. Make the bio step clear about what to write

**Problem:** Creators don't know what to put in the bio step. They write one vague line, so we have little to build their site from.

**Goal:** A creator who sees the bio input knows exactly what we want and why. They should also understand that more detail gives them a better site.

**Where to look:**
- `components/setup-flow/question-screen.tsx` (the `onShare` bio/CV/About-page hand-over, around L97)
- `components/setup-flow/setup-flow.tsx` (`shareDoc`, `bio_read`)
- The signup bio field (find it with GitNexus `query "signup bio"`)
- `backend/apps/tenant_config/interview.py` (`about_prefills` extraction, around L805)

**Do:**
- Rewrite the label, helper text and placeholder. Say what to include: what they teach, who they teach, their background and certifications, their teaching style, years of experience and what makes them different.
- Add a short example bio, shown on demand (for example "See an example").
- Say plainly why detail matters: "The more you tell us, the more your site sounds like you."
- Optional: a soft hint when the text is very short (no hard block).

**Done when:** Copy and example appear in both places a bio is asked for. A short bio gets a gentle nudge. Existing interview tests still pass.

---

## 2. Let the creator decide how multiple disciplines shape the site

**Problem:** When a creator picks several things they teach (for example yoga and nutrition), the site design follows only one of them. The creator gets no say in this.

**Goal:** The creator decides the focus. They can say their disciplines are **equal**, or pick a **main** one with the others as **secondary**. The design, copy and imagery follow that choice.

**Where to look:**
- `backend/apps/tenant_config/interview.py`: the `teaches` / `specialty` fields (around L242–292, L541, L666)
- `backend/apps/tenant_config/interview_brief.py` (`kind_of_brand`, `tile_of_brand`, `options_for`)
- `backend/apps/core/onboarding/site_composer.py` and `ai_curate.py` (`allowed_disciplines`): how the look, sections and photos are chosen

**Do:**
1. First, trace how the current design picks one discipline, and write it down.
2. When more than one discipline is selected, add a follow-up question: "Are these equally important, or is one your main focus?" If they pick a main focus, ask which one.
3. Store the answer in the brief as something like `discipline_focus: {mode: "equal" | "primary", primary?: str, secondary?: [str]}`.
4. Pass it to the site composer. "Equal" means a balanced hero, copy and photos. "Primary" means the main discipline leads and the others are supporting.
5. Skip the question when only one discipline is selected.

**Done when:** A test (or eval in `eval_compose_site`) shows that "equal" and "primary" produce noticeably different composed sites for the same two disciplines, and that a single discipline behaves as it does today.

---

## 3. Make every loading state impossible to miss (redraft first)

**Problem:** When a draft (course, event, post…) is being redrafted, the only signal is a small spinner with "Redrafting…" text and 60% opacity (`draft-review.tsx` L201–281). Creators don't notice that anything is happening.

**Goal:** Any time the wizard is updating something, the creator can't miss it.

**Where to look:** `components/setup-flow/draft-review.tsx`. Then check every other async state in `components/setup-flow/` (cover picking, photos, look cards, page approval, publish).

**Do:**
- During a redraft, cover the card being updated with a clear overlay: a prominent animated state (for example a shimmer or skeleton over the title, description and outline), plus a plain message such as "Rewriting your course with your changes…". Show progress steps if the backend gives them (the card already has "steps it is going through").
- Disable the card's actions while it updates, and make that visible.
- Keep it `motion-safe` and keep `aria-busy` / `role="status"` for accessibility.
- List every other loading state you find. Apply the same pattern to the weak ones, or report them back.

**Done when:** In the browser, a redraft is obvious at a glance on desktop and on mobile. No async action in the wizard happens without visible feedback.

---

## 4. Replace the concept slides with self-explaining questions

**Problem:** The "presentation" slides shown between questions repeat themselves and aren't clear. They slow creators down without helping them.

**Goal:** Remove the slides. Instead, each question explains itself in place.

**Where to look:**
- Frontend: `components/setup-flow/concept-slides.tsx`, `slide-pictures.tsx`, `question-screen.tsx`, `setup-flow.tsx`; the `Slide` type in `lib/setup-flow.ts` (around L369)
- Backend: `backend/apps/tenant_config/interview_slides.py` and `slides.attach(...)` in `interview.py` (around L745, L904)
- Tests: `components/setup-flow/__tests__/concept-slides.test.ts`

**Do:**
1. List every slide and the concept it teaches (for example payouts, memberships, live classes).
2. Move each concept onto the question that needs it:
   - a help icon (ⓘ) next to unclear terms, with a short tooltip or popover;
   - one-line helper text under the question;
   - a concrete example ("e.g. a 4-week beginner course for €49");
   - where it helps, a small looping help animation or illustration (you can reuse art from `slide-pictures.tsx`).
3. Delete the slide flow (frontend and backend) and its dead code and tests.

**Done when:** No slides appear anywhere in the wizard. Every concept that a slide used to teach is explained on its question. Tests are updated and pass.

---

## 5. Bug: a "21-day course" doesn't produce 21 lessons

**Problem:** A creator asked for a 21-day yoga course. The generated outline always had fewer lessons than she asked for.

**Likely cause (verify first):** `backend/apps/core/focus/kinds/course.py` L123 has fixed sizes: `SIZES = {"quick": (1, 4), "short": (3, 4), "full": (6, 4)}` (modules × lessons). `outline.py` also caps at `MAX_MODULES = MAX_LESSONS = 12`. A request for 21 lessons is probably snapped to one of these presets, or the model's count isn't enforced.

**Do:**
1. Write a failing test first: the prompt "21-day yoga course, one lesson per day" must produce exactly 21 lessons.
2. Find where the requested count is lost: analysis/extraction, size choice, outline prompt, or post-processing (`outline.py` around L199–250, L326, L364).
3. Fix it so an explicit count ("21 days", "30 lessons", "8 weeks") is extracted and respected exactly. Structure it sensibly (for example 3 weeks × 7 lessons). Fall back to the presets only when no count is given.
4. Decide what happens above the cap (12×12). Keep the existing honest `CAPPED` message.

**Done when:** The new test passes, presets still work when no count is given, and the existing `test_focus_*` tests pass.

---

## 6. Free trial class for a recurring class

**Problem:** Creators want to offer a free trial. Example: a weekly class costs €19 per session, but the first session is a free trial that anyone can join.

**Where to look:**
- `backend/apps/live/models.py`: `LiveClass`, `LiveStream`, `ZoomClass`, `OnsiteEvent` each have `pricing_type` (free / paid / subscription) and `price`
- `backend/apps/core/focus/kinds/event.py`: a weekly class is a "series". `finish` copies the first session to the rest (around L6, L333, L513).
- `backend/apps/core/focus/kinds/bundle.py` (how series are priced in bundles)
- The checkout/enrolment path for paid events (find it with GitNexus)

> [!IMPORTANT]
> Decided: the **first session of the series** becomes free for everyone. This is a price override on that one session. It is **not** a "first session free for each new student" trial.
> It is **optional**: the creator turns it on herself. It is off by default.

**Do:**
- Add an opt-in trial flag for a series. When the creator turns it on, the first session's price is overridden to free and the session is labelled "Trial". Nothing changes when it's off.
- In the wizard event step, add an optional toggle: "Make the first session a free trial?" Include a help icon that explains what a trial class is. Default: off.
- Let the creator turn it on or off later from the class's admin page too.
- On the public page and checkout, show a "Free trial" badge on that session. Anyone can join it without paying. Every other session keeps its normal price.
- Make sure copying the series in `finish` doesn't copy the free price onto the other sessions.

**Done when:** Tests show that:
- with the trial on: one free session that anyone can join without paying, and N paid sessions that still need payment;
- with the trial off: every session is priced exactly as it is today.

---

## 7. Use the full website editor in the pre-launch page review

**Problem:** Before going live, creators review their pages but can only approve them. To change anything, they have to leave the flow.

**Goal:** In the review step, the creator can edit anything on the page with our existing website editor, then approve it.

**Where to look:**
- Review step: `components/setup-flow/builder-preview.tsx`, `browser-frame.tsx`, `golive-panel.tsx`, `go-live-card.tsx`; `setup-flow.tsx` (approve `page:${key}`, around L450)
- Existing editor: `components/owner/canvas/` (`edit-mode-canvas.tsx`, `editor-store.tsx`, `editor-controls.tsx`, `block-toolbar.tsx`)

**Do:**
1. Find out how the canvas editor is mounted on the live site today: routing, auth, the store, and how saving works.
2. Embed it (or open it in place, for example as a full-screen editor) from each page in the review step. Avoid building a second editor.
3. Edits save to the same page data, and the review preview refreshes afterward.
4. A clear "Done editing → back to review" path. Approving still works as before.

**Done when:** In the browser, a creator can change text, images and sections of a page during review, return, see the change in the preview, approve, and go live with it.

---

## 8. Rename "Go to your studio" to "Go to your control panel"

**Problem:** After launch, the button "Go to your studio" is unclear. Creators don't know it leads to the admin area.

**Where:** `components/setup-flow/launch.tsx` L90 (the button points to `/admin`). The doc comment at L10–11 also says "the studio".

**Do:**
- Change the label to "Go to your control panel". Also update the doc comment at L10–11 to match.
- **Scope: this post-launch button only.** Don't rename "studio" anywhere else. The word also means the creator's brand, for example "studio name".
- Note: this string is hardcoded English while the component uses `next-intl`. Move it to the `admin` messages if that's the local convention.

**Done when:** The button reads "Go to your control panel" and any affected tests or snapshots are updated.
