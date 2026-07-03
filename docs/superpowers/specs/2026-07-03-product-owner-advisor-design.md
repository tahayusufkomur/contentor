# Product Owner Advisor — Design

**Date:** 2026-07-03
**Status:** Approved (user, option A)

## Problem

The owner builds Contentor alone. Product state is scattered across
`docs/REFERENCE.md`, session ledgers, memories, unpushed commits, and
undeployed branches — so "what is left / what should I do next?" has no
single answer and consumes constant mental energy.

## Decisions (user-confirmed)

| Question | Decision |
|---|---|
| Scope | Contentor only |
| Mechanism | Living backlog doc + on-demand `/po` skill (no scheduled agent for now) |
| Prioritization lens | Everything (features + ops/debt), ship-first |
| Commercial stage | Pre-launch — north star is the **shortest path to the first paying coach** |

## Component 1 — `docs/PRODUCT.md` (living product plan)

Single authoritative file, owned by the advisor:

1. **North star & launch-ready checklist** — what must be true before a real
   coach is onboarded (explicit, checkable items).
2. **Feature inventory** — every feature with honest status:
   `live-in-prod` / `built-not-deployed` / `built-unverified` / `partial` /
   `missing`. Uncertain statuses are marked `verify`.
3. **Backlog: Now / Next / Later** — each item has a one-line PO rationale
   tied to the north star. Ops debt (rotations, undeployed branches,
   unverified prod flows) ranks in the SAME list by the same lens.
4. **Decision log** — accumulated product decisions (seeded from
   REFERENCE.md §15–16), so sessions stop re-asking.
5. **Audit stamp** — last-verified date + what was checked.

## Component 2 — `/po` project skill (`.claude/skills/po/SKILL.md`)

On-demand product-owner advisor. Every invocation: read PRODUCT.md →
cheaply verify its top claims against reality (git branches/log, session
ledger, `curl` prod health, memory) → then act per mode:

- `/po` or `/po next` — state summary + top 3 recommended moves + why;
  flags doc-vs-reality contradictions found during verification.
- `/po done <thing>` — mark item done, re-rank, update stamp.
- `/po add <idea>` — capture + place in Now/Next/Later with rationale.
- `/po review` — full re-audit and doc refresh.

Behavior contract: acts like a product owner (pushes back, ties advice to
the first-paying-coach goal); asks the user a targeted question ONLY when a
ranking genuinely depends on their intent; never silently rewrites the
north star or decisions — those change only on explicit user say-so.

## Component 3 — Initial audit (one-time, builds PRODUCT.md v1)

Inventory sources: `docs/REFERENCE.md` (esp. §15 roadmap, §16 decisions),
git history/branches (incl. the ~88 unpushed commits on local main),
`.superpowers/sdd/progress.md` ledgers, assistant memory (deploy states,
unverified prod features, security rotations), and gap analysis against
"first paying coach" (e.g. TR/iyzico absence, dunning UI, quota 402s,
coach payout visibility, onboarding polish for non-technical coaches).

## Error handling / maintenance

- PRODUCT.md is authoritative-by-declaration; drift self-corrects because
  every `/po` run re-verifies top items before advising and refreshes the
  stamp.
- Verification checks must be cheap and read-only (no deploys, no writes to
  prod); anything expensive is proposed as a task, not run inline.
- If PRODUCT.md is missing/corrupt, `/po` rebuilds it via the `review` path.

## Testing

- Spec-level: after building, run `/po next` in a fresh context and check it
  produces: state summary, 3 ranked moves with rationales, and at least one
  verified-against-reality claim.
- PRODUCT.md v1 self-review: no `verify` statuses that could be resolved
  cheaply now; every Now item has a rationale; launch checklist is concrete.

## Out of scope (explicitly)

Scheduled/weekly automated reviews (may add later); other projects
(squeezeVid, mailCraft, …); any product feature implementation itself.
