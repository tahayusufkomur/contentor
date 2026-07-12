# Product Owner Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/po` project skill + an audited `docs/PRODUCT.md` v1 so the solo owner always has one answer to "what is left and what's next."

**Architecture:** Two artifacts. `docs/PRODUCT.md` is the authoritative living product plan (north star, feature inventory with honest statuses, Now/Next/Later backlog, decision log, audit stamp). `.claude/skills/po/SKILL.md` is the advisor: every invocation re-verifies PRODUCT.md's top claims against reality (git, ledger, prod health) before advising. A one-time audit populates v1.

**Tech Stack:** Markdown docs + Claude Code project skill (no application code).

## Global Constraints

- Scope: Contentor only. Lens: everything (features + ops/debt), ship-first. North star: shortest path to the first paying coach (pre-launch).
- Verification checks in `/po` must be cheap and read-only — no deploys, no prod writes; expensive work is proposed as a task, never run inline.
- `/po` never rewrites the north star or decision log without explicit user say-so.
- Repo: /Users/tahayusufkomur/ws/projects-in-progress/contentor, branch `main` (local, unpushed by convention). Commit after each task; stage only listed files (shared working tree).

---

### Task 1: `/po` skill

**Files:**
- Create: `.claude/skills/po/SKILL.md`

**Interfaces:**
- Produces: user-invocable `/po` skill with modes `next` (default), `done <thing>`, `add <idea>`, `review`. Reads/writes `docs/PRODUCT.md` (Task 3's file — the skill defines the contract).

- [ ] **Step 1: Write the skill file** with exactly this content:

````markdown
---
name: po
description: Contentor product-owner advisor. Use when the user asks "what's next", "what is left", wants product priorities, roadmap review, or to mark product work done / add ideas. Modes - /po [next] (state + top 3 moves), /po done <thing>, /po add <idea>, /po review (full re-audit).
---

# /po — Contentor Product Owner

You are Contentor's product owner. The owner builds this SaaS alone,
pre-launch. Your north star for ALL advice: **the shortest path to the
first paying coach.** Ops debt and features rank in the same list by that
one lens.

## Source of truth

`docs/PRODUCT.md` — read it FIRST, every invocation. Sections: North star &
launch checklist / Feature inventory / Backlog Now-Next-Later / Decision
log / Audit stamp.

## Always verify before advising

PRODUCT.md drifts. Before answering, spend a few cheap read-only checks on
its TOP claims (Now items + anything the answer depends on):

- `git log --oneline -15` and `git status -sb` — what landed since the
  audit stamp; how far local main is ahead of origin.
- `tail -30 .superpowers/sdd/progress.md` — what recent agent sessions did.
- `curl -sf https://contentor.app/api/health/` — prod alive (skip if offline).
- Grep the repo for anything a Now item claims is missing (it may have
  been built since).

Report contradictions you find ("PRODUCT.md says X is undeployed, but …")
and fix them in the doc as part of your answer.

## Modes

**`/po` or `/po next`** — Output, in order:
1. *State of the product* — 3-6 sentences, honest, from verified facts.
2. *Top 3 next moves* — ranked, each with a one-line WHY tied to the first
   paying coach. Include effort guess (hours/days).
3. *Contradictions/corrections made* — if any.
Update the audit stamp (date + what you checked).

**`/po done <thing>`** — Move the item to done in the inventory/backlog,
re-rank Now if it unblocked something, update stamp. Confirm in one line.

**`/po add <idea>`** — Place it in Now/Next/Later with a one-line rationale
(push back if it doesn't serve the north star — you are a PO, not a
stenographer). Confirm placement + what it displaced, if anything.

**`/po review`** — Full re-audit: re-derive the feature inventory statuses
from the repo + ledger + memory, rebuild the backlog ranking, refresh every
section, keep the decision log append-only. Use this too if PRODUCT.md is
missing or corrupt (rebuild from `docs/REFERENCE.md` §15-16 + git + ledger).

## Behavior contract

- Push back with reasons; never just append wishes.
- Ask the user a targeted question ONLY when a ranking genuinely depends on
  their intent (e.g. two valid launch strategies); otherwise decide and say why.
- NEVER change the north star or Decision log entries without the user
  explicitly saying so; propose instead.
- Cheap read-only verification only: no deploys, no prod mutations, no test
  suites. Anything expensive becomes a recommended move, not an inline action.
- Keep PRODUCT.md's voice terse and factual; statuses only from the fixed
  set: live-in-prod | built-not-deployed | built-unverified | partial |
  missing | verify.
````

- [ ] **Step 2: Verify skill registration**

Run: `ls .claude/skills/po/SKILL.md && head -4 .claude/skills/po/SKILL.md`
Expected: file exists, frontmatter has `name: po`.

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # main
git add .claude/skills/po/SKILL.md
git commit -m "feat(po): product-owner advisor skill"
```

---

### Task 2: Reality audit (facts file)

**Files:**
- Create: `/private/tmp/.../scratchpad/po-audit-notes.md` (scratch — NOT committed)

**Interfaces:**
- Produces: verified facts list consumed by Task 3. Every fact tagged `[verified]` (command output) or `[memory]` (from assistant memory / ledger, cheap-checkable later).

- [ ] **Step 1: Gather repo/deploy facts** (run each, note outputs):

```bash
git log --oneline origin/main..main | wc -l        # unpushed commit count
git log --oneline origin/main..main | head -30      # what's in them
git branch -a                                       # stray branches
tail -60 .superpowers/sdd/progress.md               # session ledger
curl -sf https://contentor.app/api/health/          # prod alive?
grep -n "iyzico" backend/apps/billing/providers/__init__.py backend/apps/billing/providers/*.py | head
sed -n '503,545p' docs/REFERENCE.md                 # roadmap §15
```

- [ ] **Step 2: Write the known-facts baseline into the notes file.** Seed it with these memory-derived facts (verify cheaply where possible, else tag `[memory]`):

- Prod = contentor.app on home-server behind Cloudflare tunnel; deploy via `~/ws/home-server/deploy.sh contentor`.
- Local main is ~90 commits ahead of origin (marketplace, Caddy, site-builder, filters, tags, mailbox, PWA-usage dashboards, local-e2e, bugfixes) — pushed≠deployed; marketplace/billing UNVERIFIED in prod ("don't blind-deploy").
- Custom-domain onboarder: Phase 1 backend merged locally, behind bypass fakes, needs prod creds + 3 more phases.
- Coach mailbox: all 3 phases built + merged locally; needs coach browser test + prod env/worker deploy (MAILBOX_INBOUND_SECRET, Cloudflare Email Worker).
- Announcements (push/feed/email/templates/recurring): deployed to prod 2026-06-23; coach-UI browser smoke still pending.
- Student PWA: merged; PWA usage tracking dashboards shipped to origin, not deployed.
- Tenant-migrations deploy gotcha fixed in entrypoint (verify committed/deployed).
- Security debt: rotate keys listed in `.env.prod` across projects (memory: zeyneple-secrets-to-rotate); dev Stripe live-keys issue RESOLVED (test keys in place).
- Roadmap §15 (June 2026): finish platform billing Phases 2-4 (dunning UI, quota 402s, receipts/metrics), M2 marketplace (Stripe Connect DONE-ish; iyzico TR NOT implemented), admin-managed pricing (superadmin plan editing with Stripe Price swap).
- ContentorVideoProcessor: separate VPS, running.
- Coaches are non-technical → onboarding/UX polish is a launch factor, not a nice-to-have.
- Local e2e suite exists (make e2e 17p+3s; stripe 2p) — regression safety for all of the above.

- [ ] **Step 3: Gap analysis against "first paying coach".** For each launch-blocking question, answer from facts: Can a coach sign up alone? Get a subdomain site? Create content? Take student money (Connect verified in prod?)? Get paid out? See earnings? Handle failed payments (dunning)? Is TR/iyzico required for coach #1 (decision: global-first per §15 — NO)? Is prod stable/monitored enough?

---

### Task 3: Write `docs/PRODUCT.md` v1

**Files:**
- Create: `docs/PRODUCT.md`
- Modify: `CLAUDE.md` (one pointer line in Active Documentation section)

**Interfaces:**
- Consumes: Task 2 facts file. Format contract from Task 1's skill (section names + status vocabulary).

- [ ] **Step 1: Write the doc** with exactly these five sections (content from the audit; structure fixed):

```markdown
# Contentor — Product Plan
> Owned by the /po advisor. Humans edit freely; /po re-verifies and re-ranks.

## 1. North star & launch-ready checklist
Pre-launch. North star: shortest path to the FIRST PAYING COACH.
Launch-ready = every unchecked box below is done:
- [ ] ...concrete, checkable items from the gap analysis...

## 2. Feature inventory
| Feature | Status | Evidence / note |
(statuses: live-in-prod | built-not-deployed | built-unverified | partial | missing | verify)

## 3. Backlog
### Now (≤5 items, each: what / why-for-north-star / effort guess)
### Next
### Later

## 4. Decision log (append-only)
Seeded from REFERENCE.md §15-16 + this audit's decisions.

## 5. Audit stamp
Last full audit: 2026-07-03 — checked: <list>.
```

- [ ] **Step 2: Quality gate on the doc itself:**
  - Every `Now` item has a why + effort.
  - No `verify` status that a ≤1-minute check could resolve.
  - Launch checklist items are objectively checkable (no "polish X").
- [ ] **Step 3: Add pointer to CLAUDE.md** Active Documentation list: `- **docs/PRODUCT.md** — living product plan (north star, inventory, backlog); maintained via the /po skill.`
- [ ] **Step 4: Commit**

```bash
git add docs/PRODUCT.md CLAUDE.md
git commit -m "docs(product): PRODUCT.md v1 — audited inventory, backlog, launch checklist"
```

---

### Task 4: Smoke-test the advisor

**Files:** none

- [ ] **Step 1:** Invoke the skill fresh (`/po next` semantics): follow `.claude/skills/po/SKILL.md` exactly as a new session would — read PRODUCT.md, run the verification commands, produce state + top 3 moves.
- [ ] **Step 2:** Check the output satisfies the spec's test: state summary present, 3 ranked moves with rationales + effort, ≥1 claim verified against reality, audit stamp updated if anything corrected.
- [ ] **Step 3:** If the skill instructions produced a bad answer (missing section, vague moves), fix `.claude/skills/po/SKILL.md` wording and re-run once. Commit any fix: `git add .claude/skills/po/SKILL.md && git commit -m "fix(po): tighten advisor output contract"`.
