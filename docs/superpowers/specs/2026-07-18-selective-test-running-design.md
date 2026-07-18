# Selective Test Running (`test-changed`) — Design

**Date:** 2026-07-18
**Status:** Approved in brainstorming; pending final spec review

## Problem

Every change currently pays for the full verification cycle: 1,452 backend tests
(`make test`), the frontend-customer vitest suite, and — worst of all — the 24-spec
Playwright e2e suite against the live stack. Tests are already colocated per app
(`backend/apps/<app>/tests/`, `__tests__/` dirs, feature-named e2e specs), and scoped
targets exist (`make test-app`, `make e2e-spec`), but nothing maps *changed files →
tests to run*, so in practice everything runs every time.

## Goals

- One command per layer that selects and runs only the tests plausibly affected by
  the current diff, printing its reasoning.
- Fail-closed: anything the selector doesn't understand widens the run, never
  narrows it.
- Keep one enforced checkpoint where the full suite still runs (deploy preflight),
  so selection can be aggressive in the inner loop without compromising safety.

## Non-goals (v1)

- pytest-testmon / coverage-measured selection (possible later layer).
- CI or nightly automation.
- Unit tests for frontend-main (it has none).
- Selective typecheck (typecheck is already a separate advisory/lint concern).

## Current state (facts the design leans on)

- Backend: 1,452 tests across ~200 files, all colocated per app. pytest runs with
  `-n auto --reuse-db` inside the django container.
- The import graph is dense and cyclic: `core` + `accounts` are imported by every
  app, `tenant_config` imports 11 apps, `billing`↔`courses` import each other.
  A transitive reverse-dependency closure therefore approximates the full suite —
  depth-1 (direct importers) is the useful granularity.
- Dynamic coupling exists that imports don't show: signals, `adminkit`
  autodiscovery of `admin_panels.py`, celery task paths as strings.
- frontend-customer: vitest 4 (native `--changed` selection via module graph);
  19 test files. `packages/shared` sits outside the vitest project root.
- e2e: 26 feature-named specs; Stripe specs auto-skip without `STRIPE_E2E`;
  `90-logo-eval` is an AI-scored eval, not a regression test.
- No CI; pre-commit runs lint/security only. `--reuse-db` means new migrations are
  invisible to `make test` until `make test-fresh`.

## Design

### Selector script

`scripts/select_tests.py` — host-side Python 3, stdlib only (matches existing
`scripts/` tools). Core logic is a pure function
`build_plan(changed_files, import_graph, impact_map) → Plan` so it is testable
without git or docker.

Changed files = `git diff --name-only <BASE>` + untracked files
(`git ls-files --others --exclude-standard`). `BASE` defaults to `HEAD`
(uncommitted work); `BASE=main` or `BASE=HEAD~3` widens to a range. If the diff is
empty, say so explicitly and suggest `BASE=` or `make test` — never silently pass.

The script prints the full plan (changed files → buckets → selected targets, with
the reason per target) before running anything. `PLAN=1` prints without executing.

### Backend selection rules

1. Any file under `backend/apps/<app>/` (any extension — JSON content counts)
   marks `<app>` changed.
2. **Wide triggers → full backend suite:** changes under `backend/apps/core/`,
   `backend/apps/accounts/`, `backend/apps/adminkit/` (autodiscovers from every
   app), `backend/config/`, `backend/conftest.py`, `backend/requirements/`,
   `backend/pyproject.toml`, `backend/Dockerfile`, `backend/scripts/`, or any
   `docker-compose*.yml`.
3. **Migrations rule:** any `migrations/` file in the diff upgrades the plan to the
   full suite with `--create-db` (the `test-fresh` equivalent), because
   `--reuse-db` would silently ignore the new migration.
4. **Importer expansion (depth 1):** for each changed app A, run A's tests plus the
   tests of every app whose `.py` files match `apps\.A\b` — computed by live grep
   at selection time (never stale; the word-boundary pattern also catches string
   references like celery task paths). Deliberately not transitive: with this
   graph, transitive ≈ full suite. Deep-chain regressions are the checkpoint's job.
5. Apps without a `tests/` dir (`email_campaigns`, `demo_seed`) still expand to
   their importers.
6. Unrecognized backend path → full backend suite (fail-closed).

Execution: `docker compose exec django pytest apps/<a> apps/<b> … -n auto`.

Example: `apps/community/views.py` → `community` + `tenant_config` (its only
importer) ≈ ~40 files. `apps/core/signals.py` → full suite, correctly.

### E2e selection — `make e2e-changed`

Separate target (needs the dev stack, costs real minutes). Driven by a checked-in
`e2e/impact-map.json`:

- `backend.<app>` → list of spec names, or the string `"none"` for apps with
  genuinely no e2e surface (`usage`, `filters`, …) so silence is never ambiguous.
- `frontend-customer.<src-dir-prefix>` → list of specs (longest-prefix match).
- `frontend-main` → its specs (`01-signup-onboarding`, …).

Rules:

- `00-smoke` always runs.
- A changed `e2e/specs/*.spec.ts` selects itself.
- Any other `e2e/**` change (helpers, fixtures, playwright.config) → all specs.
- Backend wide trigger (rule 2 above) → all specs.
- Changed app/dir with **no map entry at all** → all specs (fail-closed);
  explicit `"none"` → smoke only.
- `90-logo-eval` is marked manual-only in the map: selected only when its own spec
  file changes.
- Stripe specs may be selected; their existing `STRIPE_E2E` auto-skip behavior is
  unchanged.

The initial map is derived by reading what each spec actually exercises, then
maintained as reviewable data. The selector's self-test asserts every file in
`e2e/specs/` is referenced by the map (or explicitly manual), so new specs can't
be silently unmapped.

### Frontend unit selection

Folded into `make test-changed`:

- `frontend-customer/**` changed → `npx vitest run --changed` (`--changed <BASE>`
  when BASE is given).
- `packages/shared/**` changed → full `npx vitest run` (module-graph detection
  across the project root boundary is not trusted; the suite is small).
- `frontend-main/**` changed → note in the plan that no unit suite exists; rely on
  typecheck + e2e.

### Checkpoint — where the full suite still runs

`make deploy` gains a preflight: run full `make test` first; abort on failure.
`SKIP_TESTS=1 make deploy` is the explicit escape hatch. Full e2e before deploy
stays a recommended manual step. (Optional later: nightly scheduled full run.)

### Makefile changes

- New targets `test-changed` and `e2e-changed` (accepting `BASE=`, `PLAN=1`),
  added to `.PHONY` and to the `help` target's grep patterns (Quality and E2E
  groups — `help` filters by explicit target names).
- `deploy` preflight as above.

### Testing the selector

`scripts/select_tests.py --self-test` runs embedded fixture cases against
`build_plan` (leaf app, wide trigger, migrations, unmapped app, empty diff,
spec-file change, shared-package change) plus the impact-map completeness check.
Wired into `make lint` so it runs with the existing quality gate.

## Documentation updates (references)

- **CLAUDE.md** — Commands block: add `make test-changed` and `make e2e-changed`
  with one-line descriptions. "Local fakes + e2e" paragraph: mention
  `e2e/impact-map.json`. Home-server deploy section: note the deploy test
  preflight and `SKIP_TESTS=1`.
- **docs/REFERENCE.md** — §11 Infrastructure & deployment → Dev "Useful:" line:
  add both new targets.
- **Makefile `make help`** — covered by the grep-pattern change above.

## Risks & mitigations

- **Depth-1 misses deep transitive effects** → deploy preflight runs everything;
  hub apps (`core`, `accounts`, `adminkit`) are wide triggers anyway.
- **Coupling invisible to grep (DB-level interactions, shared fixtures)** → same
  checkpoint answer; fail-closed defaults keep unknown paths wide.
- **Impact map drift** → unmapped-→-all fallback, map completeness check in the
  self-test, map reviewed as data in diffs.
- **Selector bugs** → pure-function core with self-test in `make lint`; `PLAN=1`
  dry-run for humans to sanity-check selection.
- **Stale test DB after migrations** → migrations rule upgrades to `--create-db`
  automatically.
