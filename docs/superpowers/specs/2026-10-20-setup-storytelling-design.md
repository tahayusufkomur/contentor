# Setup as a story: the team presents, the creator learns the platform

Date: 2026-10-20 · Status: direction agreed with the owner in conversation the same day, for
approval · Mockups (git-ignored, served by the brainstorm companion):
`.superpowers/brainstorm/49470-1792525945/content/storytelling-voice.html` (C picked),
`storytelling-journey.html` (where the team drops in, the hand-off) and `storytelling-slides.html`
(the presentation, agreed) · Builds on `2026-10-17-agent-team-studio-design.md` (the team spec:
names, colours, what each specialist can do today).

## 1. Intent

The owner's words: Contentor is "like a team for the creator. It takes all the complex parts out of
the equation, and lets the user focus on creating high-quality content." Once a coach finishes
`/setup`, they should know what the platform can do for them, and who on their team does it.

Second, our words are not theirs. A coach may not know what we mean by a course, a membership, a
way in, a look. Setup should explain every concept it uses, at the moment it uses it, "a bit like a
presentation", taking "a little bit of time" for it.

What the code shows today (survey 2026-10-20):

- `/setup` is one question at a time (`backend/apps/tenant_config/interview.py` +
  `interview_brief.FIELDS`, rendered by `frontend-customer/src/components/setup-flow/question-screen.tsx`).
  The guide phrases each question with AI; code owns the order and every fallback.
- Teaching exists but is thin and dry: a one-line `why` under some questions (offers, payments,
  memberships, access, currency, photos, location), `details` under the five "how you'll work" tiles,
  fixed `hints` under the payment tiles. Most concepts (the look, the logo, a course's insides, live
  classes, payouts, the studio) are never explained.
- The team of six exists in the studio (`apps/core/copilot/team.py` ↔ `lib/copilot/team.ts`,
  `components/copilot/specialist-face.tsx`) and on the landing page, but setup never mentions it.
  The team spec planned a one-line team intro in setup; it was never built.
- Going live ends on `setup-flow/launch.tsx` (`Celebration`): "{brand} is live", the address, "Go to
  your website" and "Go to your admin panel".

## 2. Goals, non-goals, anti-goals

Goals

- By the end of setup the coach has met their team and knows, for each specialist, what they took
  off the coach's plate and what they will do next.
- Every concept setup asks about is explained once, before the question that uses it, with an
  example from the coach's own field and audience, not a definition.
- It feels like a short presentation the coach clicks through, not a form with help text.

Non-goals

- No changes to what setup asks or builds: the same fields, the same drafts, the same pages.
- No new specialist abilities. The team spec's ladder owns those.
- No studio tour after setup (coach marks, tooltips in `/admin`). The hand-off points at the studio;
  teaching inside it is a separate piece of work.
- No translation work: setup is English today and stays so.

Anti-goals (a failure even if it works)

- Setup gets noticeably slower to answer. No question may wait on slide content.
- A slide or hand-off line promises something the platform cannot do today. The Financial
  Strategist, for instance, can do nothing on its own yet (team spec §4): it may explain and point,
  not promise.
- An experienced creator is forced through explanations they don't need.
- The voice turns into a chorus: the guide stops being the one who asks.

## 3. Decisions

| # | Decision | Source |
|---|---|---|
| S1 | One guide asks every question, in one voice. A specialist drops in for the concepts they own (mockup "C, guide hosts, specialist drops in"). | Owner picked C |
| S2 | The drop-in is a slide: a full-width moment with one idea, one picture and Next, shown right before the question that uses it. The question after it stays in the guide's voice. | Owner ("a bit like a presentation", "yes something like this") |
| S3 | Explaining takes time on purpose: about 10–14 slides at ~15 seconds each, roughly 3 extra minutes on a ~15-minute setup. | Owner ("sounds good") |
| S4 | An opening slide by the Assistant introduces all six: "You're not doing this alone." | Mockup, agreed with S2 |
| S5 | After going live, the celebration hands the coach over to the team: each specialist with what they did during setup and the one next thing. The main button goes to the studio. | Mockup, not objected to |
| S6 | Build-status lines are signed by whoever does the work ("Designer: I'm starting on your home page now."). | Mockup, not objected to |
| S7 | The slide pictures are built from the coach's own answers (their field, their audience, their brand), and the money slide tells a small story with three of the coach's would-be students (one buys a course, one joins a membership, one pays per class), with what each pays over three months. | Mockup, not objected to |
| S8 | Every slide can be skipped ("I know this"). | Mockup, not objected to |
| S9 | Only concepts the coach will meet get a slide: one overview of the ways to work, then a slide for each picked way that has its own questions in setup (course, live class, in-person event), right before them. Articles are the Marketing Specialist's slide; community is the Community manager's. | My call, said in chat; narrowed after the builder check |
| S10 | Slide content specific to the coach is written by AI once, in the background, and never on a turn's path. A fixed, field-neutral version is the fallback and must read well on its own. | My call, said in chat |
| S11 | The C-style small card on the question screen is not built: the slide replaces it. The question keeps today's `why` line where it has one. | My call |
| S12 | Skipping is per slide only. No "skip all explanations" switch in v1; the recorded skips (§5) show whether one is needed. | My call |
| S13 | The look and the logo get their own Designer slide before `site_style`, not inside the first Designer slide: `photos` is the 3rd question and `site_style` comes about eight later. | My call, after the builder check |
| S14 | A slide shows with the turn that asks its question, after the AI turn returns, never during the wait. Covering the wait means predicting the next field, which the model can reorder (`_next_field`); that is the upgrade path if the extra time shows in the funnel. | My call, after the builder check |
| S15 | Setups already under way (prod has tester tenants mid-setup) get slides only for questions still ahead, and no opening slide once interview turns exist. | My call, after the builder check |

## 4. The experience

### The slide

Full width of the setup column (the builder preview, when present, stays where it is). Top: the
presenter's face (`SpecialistFace`, the team's colour and icon), their name, and on their first
appearance one line on what they look after ("I look after your money"); on later slides, just the
name. A small chapter label and progress dots ("Getting paid · 1 of 2"). Then a headline (one idea,
under ~8 words), two sentences at most, and the picture. Bottom: "I know this" (skip) and Next, whose
label names what comes next ("Next: live classes", "Choose yours").

The setup shell's own palette and type (`setup-flow/tokens.ts`, `--sf-*`), CSS-only motion gated by
`motion-safe:`, keyboard: Enter or → is Next. It works at phone width (pictures stack). The mockup's
avatar colours are placeholders: use `SPECIALIST_LOOK`.

### The slides

Presenter, when it shows, and what it teaches. "Picture" is built from the coach's answers; text in
quotes is the direction, not final copy.

| # | Slide | Presenter | Shown | Teaches | Picture |
|---|---|---|---|---|---|
| 1 | You're not doing this alone | Assistant | Once, before the first question | The team: six specialists, one line each on what they handle | The six faces with their one line |
| 2 | Your site, built while we talk | Designer | Before `photos` | Pages (home, about, contact, FAQ) are built as they answer; own photos or ones picked for them; everything changes later | The four pages as empty sketches waiting to fill (no page exists yet: home fires only after `pitch`, `PAGE_NEEDS`) |
| 3 | Ways to work with your students | Content Creating Specialist | Before `offers` | Course, live online class, in-person event, articles, community: one example each in the coach's field | Five small cards, one per way |
| 4 | How new students find you | Marketing Specialist | Before `pitch` | Their pitch becomes the home page headline and what Google shows; articles and socials bring people in (the articles slide: none before `article_topic`) | A search result and the home page headline, with the brand |
| 5 | Your look and logo | Designer | Before `site_style` | What a look is (fonts, colours, layout, light and dark); the logo; both change any time | The coach's home page in two looks once it is ready, else the sketches |
| 6 | Three ways students pay you | Financial Strategist | Before `payments` (after `currency`) | Course purchase vs membership vs pay per class, as a story of three students | Three students, what each pays over three months, in the coach's currency |
| 7 | What a membership is | Financial Strategist | Before `memberships`, only when membership was picked | One monthly price; it can cover everything or one thing; several can exist | Two example memberships and what each unlocks |
| 8 | Ways in | Financial Strategist | Before the first access question (`course_access`, `event_access` or `onsite_access`) | Free, sold on its own, part of a membership, or several; every item later has the same Access section | One item with its ways in ticked |
| 9 | What a course is | Content Creating Specialist | Before `course_topic` | Modules and lessons, students go at their own pace and keep it; "I draft the outline, you record" | An example course card: title, modules, lessons, price |
| 10 | How a live class works | Content Creating Specialist | Before `live_topic` | Scheduled, students join from the coach's site, recurring or one-time | A class card with its next date and a join button |
| 11 | In-person events | Content Creating Specialist | Before `onsite_topic` | A place and times on the site; the street address goes only to students who can come | An event card with the place |
| 12 | Hearing from your students | Community manager | Before `contact` | Messages land in the coach's inbox; class reminders go out on their own; the community space (the community slide) when picked | An inbox with one message |
| 13 | Getting paid | Financial Strategist | On the go-live step, in place of today's payouts card text | Stripe runs checkout, pays out to the bank, holds the bank details (today's three lines) | Today's payouts card, in their voice |

This is the complete list. Slides 1–6, 12 and 13 show for everyone; 7–11 depend on what the coach
picked. That gives 8 to 13 slides plus the hand-off, inside S3's budget. If the field a slide belongs to is never asked (the
coach answered it in passing), the slide shows before whichever question comes next, so no concept
is lost. A section the coach skips takes its slides with it.

### Build-status lines (S6)

`interview.started_note` signs its line by owner: pages → Designer, course/event/in-person drafts →
Content Creating Specialist, the first article → Marketing Specialist. The go-live "Giving every
page a last look" is the Designer's. Code-owned, no AI.

### The hand-off (S5)

The `Celebration` screen keeps "{brand} is live" and the address, then shows six cards. Each card:
the face and name, one line on what they did during setup, one line on the next thing.

- "Did" lines are built by code from what setup made (pages built, the course and class titles,
  membership names, the first article, contact ways). A specialist with nothing to show says what
  they look after instead.
- "Next" lines are fixed per specialist and point only at things that work today (record the first
  lesson in the course editor, connect payouts, share the site). No AI.
- "Go to your studio" (today's "Go to your admin panel", `/admin`) is the main button, "Visit your
  site" the second.

### Words

Slides follow the interview's Words rule: the person is a creator, never a teacher, coach or
instructor. Terms are the glossary's (course, module, lesson, membership, way in, live class,
in-person event, articles, community, payouts), each said the same way on its slide, in its
question and in the studio.

`OPENING_ACK` ("This takes about 15 minutes") becomes about 18.

## 5. How it works

- **Where slides attach.** A slide belongs to a field: the guide turn for that field carries the
  slide to show first (code-owned, from the table above). The client shows it before the question.
  Next and "I know this" are recorded with a small call (not an interview turn, no AI), so a reload
  or going back never replays a slide.
- **Coach-specific content (S10).** As soon as setup knows what the coach offers and who they work
  with (`teaches` + `audience`), one background AI call writes every slide's examples at once:
  example course title with module and lesson names, example membership names, the three students
  (name, one-line description from the audience answer), one example per way of working, a
  headline-style pitch example. Stored in the answers like `tone_hints` are. Amounts are stored as
  numbers and rendered with the coach's currency when the slide shows (currency is asked later).
  Until it lands, or if it fails, the fixed fallback shows. The opening slide needs none of it.
- **The hub.** The background call must not take the coach's interactive slot on the agent hub
  (`reference-agent-hub-scheduling-and-rules`: one interactive run per account; a run marked
  interactive cancelled coach turns once). It goes as background work.
- **Fallback copy.** One field-neutral set ("a 6-week program", "a monthly pass", three generic
  students), with the brand name. No per-niche fallback sets.
- **Recorded.** Which slides were seen and which skipped, in the answers, so resume works and
  `setup_funnel` can later show what creators skip.

## 6. Verification

- Unit tests: which slide a field gets for a given set of answers (picked ways, membership or not,
  skipped sections), slides never repeat after resume, `started_note` signatures, hand-off "did"
  lines from a finished setup, the fallback when the background content is missing.
- e2e: `01-signup-onboarding` walks `/setup` and must pass through slides (Next or "I know this");
  `14-navbar-layouts` and `27-nav-stage-gating` also open `/setup` and must keep passing. Add the
  slide component to `e2e/impact-map.json` with those specs.
- By eye: a full setup in the dev stack on desktop and phone, once with a membership + course +
  live class, once with free-only articles, timing the extra minutes against S3.

## 7. Left to the builder

- The slide component's structure, and whether it reuses `BuilderPreview` or the look and draft
  cards for pictures.
- Exact slide copy, inside the directions above, the Words rule and the no-promises anti-goal.
- The background call's prompt, model and effort, and how it is triggered (alongside the page
  milestones is the obvious place).
- Transitions between slide and question, within the existing `sf-*` animations.
- Whether the hand-off cards link each specialist to their studio section.

## 8. Open questions for the owner

None. The builder check's three questions (the complete slide list, slides during the AI wait,
setups already under way) were settled as S9, S13, S14 and S15.
