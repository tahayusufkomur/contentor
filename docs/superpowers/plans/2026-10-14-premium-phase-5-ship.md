# Premium look — Phase 5: Ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The premium look built in Phases 0–4 is verified on the dev stack (gates, visual pass, budgets, review), deployed to prod on both fleet nodes, verified on prod, documented, and reversible with one command.

**Architecture:** Nothing new is built. The phase runs the repo's existing gates against the _committed_ tree (a detached worktree of `HEAD`, because the shared checkout carries peers' uncommitted files), looks at every public page and the studio at three widths, measures the spec 5.7 budgets with the Chrome DevTools MCP and a 40-line Playwright script, gets one independent whole-branch review, then ships through the fleet's `deploy.sh` (active node first, then the standby) and checks prod with `curl` and the browser pane. Docs are updated last and the shipped spec/plans are removed per the repo convention.

**Tech Stack:** `make` targets (`typecheck`, `lint`, `test-frontend`, `test-changed`, `e2e-spec`, `wiki`), Playwright (already installed in `e2e/`), Chrome DevTools MCP (`performance_start_trace`, `lighthouse_audit`, `emulate`), the Claude Browser pane, computer-use (Safari, read tier), `~/ws/home-server/deploy.sh` + `scripts/secrets.sh` (Cloudflare KV, Touch ID), `scripts/ha.sh status`, the `awesome-connectors` read-only prod SQL connector, `curl`, `jq`.

**Spec:** `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md` — this plan is the "5 Ship" row of section 6, section 7 (Verification) and section 8 (Risks). Earlier phases: `docs/superpowers/plans/2026-10-14-premium-phase-{0,1,2,3,4}-*.md`. Where a Phase 1–4 plan file is missing at execution time, the spec is the contract (filenames below come from the Phase 0 "Contracts for later phases" block).

## Global Constraints

- One heavy job on the Docker VM at a time: a full backend suite, an e2e spec, a `next build`/image build or a footage recording never overlap. Check `pgrep -fl 'playwright test|pytest|next build'` before each one.
- Never run `make test` separately right before `make deploy`: `make deploy` runs the full backend suite itself. With the worktree form (`SOURCE_BASE=… ./deploy.sh contentor`, Task 7) no suite runs inside the deploy, so the backend gate is Task 1 Step 7's `make test-changed` plan.
- Never reset or write prod data. Prod has 18 tenants (external testers since 2026-10-08) and live Stripe. Prod SQL goes through the connector with `readOnly: true` only. Never run `seed_dev_tenants --reset` on prod.
- `BILLING_BYPASS_ENABLED` MUST be `false` in prod (`secrets.sh get contentor`). This phase changes no prod secret.
- The main checkout is shared with peers: never commit, revert or format a file you did not change; `make lint` runs prettier repo-wide, so check `git status` afterwards and leave other people's files alone.
- The owner's standing instruction for contentor (memory `feedback-always-commit-deploy-verify-prod`) covers committing on the branch, deploying and verifying prod for this phase. It does not cover pushing to the git remote, spending money, or destructive prod data changes.
- Pre-commit must pass clean (zero findings) for every commit; the four frontend hooks need `node_modules`, so commit from the main checkout, not from the worktree.
- Spec 5.7 budgets, verbatim: LCP ≤ 2.5 s, CLS ≤ 0.05, INP ≤ 200 ms; media ≤ 8 MB desktop and ≤ 4 MB phone on a full scroll; landing JavaScript ≤ 250 KB gzipped. Spec 5.3: hero clip ≤ 3 MB, any clip ≤ 2 MB, `frontend-main/public/media` ≤ 35 MB.
- Spec D4/D6: marketing renders light always; the studio keeps the coach's one light/dark choice; tenant public pages are untouched (their theme sheet still overrides `:root`).
- Never use `FLEET_CF_SECRETS="$(ssh … cat /dev/shm/.env.contentor)"` to skip Touch ID; the owner answers the prompt.

## Review Focus

1. **The Cloudflare rule for `contentor.app/media/*` also caches `/media/media.json`** (Phase 2 mirrors Pix4Less's "videos" rule: 7-day edge TTL regardless of origin headers). Policy: media filenames are immutable — a re-encode ships under a new name and `media.json` points at it; `media.json` itself is imported at build time by `frontend-main/src/lib/media.ts` and never fetched at runtime, so a stale edge copy is harmless to visitors but must not fool the human check. Pinned in Task 8 Step 4 (grep that nothing fetches it; compare the cache-busted prod manifest's checksum with the committed file).
2. **Media that is on disk in dev but not in the commit.** Dev bind-mounts `frontend-main/public`, so an untracked clip renders fine locally; pre-commit's `check-added-large-files --maxkb=1000` blocks every clip over 1 MB unless Phase 1 skipped it per file, and a forgotten `git add` ships nothing. The worktree deploy carries only committed files → 404 posters on prod. Pinned in Task 1 Step 3 (`git ls-files` count equals `find` count; the worktree has the posters).
3. **The standalone image drops or bloats on media.** `frontend-main/Dockerfile`'s runner stage copies `public/` wholesale (`COPY --from=builder /app/public ./public`) and `.dockerignore` does not exclude it, so the clips ship; a folder over 35 MB slows every build on the home server and lands in a 256 MB container. Pinned in Task 1 Step 3 (`du -sm` ≤ 35, the Dockerfile grep) and Task 8 Step 3 (a poster answers 200 `image/avif` from prod).
4. **The permission classifier denies `./deploy.sh contentor`** (seen 2026-10-13 under auto mode as "[Production Deploy]"; allowed the same day when run in the background from `~/ws/home-server`). Pinned in Task 7 Step 6: try once, in the background; if denied, hand the owner the exact `SOURCE_BASE=… ./deploy.sh contentor` line and stop — never route around it.
5. **A tenant site regression under the shared token sheet that only prod looks reveal.** Dev has `demo-yoga` and scratch tenants; prod has 18 tenants on many looks. `site-styles.test.ts` and `00-smoke` prove the mechanism (the tenant sheet still overrides `:root` outside `/admin`), not every look. Pinned in Task 7 Step 4 (baseline screenshots of three prod tenant homes before the deploy) and Task 8 Step 7 (the same three after; identical).

---

### Task 1: Pre-flight — prove the committed tree is what ships

**Files:**

- Create (scratch, outside the repo): `$SCRATCH/deploy/contentor` — a detached git worktree of `HEAD`
- Read only: `frontend-main/Dockerfile`, `.dockerignore`, `frontend-main/public/media/media.json`

**Interfaces:**

- Produces: shell variables used by every later task — `BASE` (the commit before Phase 0's first commit), `SHA` (the commit being shipped), `DEPLOY_BASE` and `W` (the deploy worktree). Re-derive them at the top of each task; agents' shells do not persist.

- [ ] **Step 1: Find the branch range and set the variables**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
# Paste your session's scratchpad path from the environment block, e.g.
# /private/tmp/claude-501/-Users-tahayusufkomur-ws-projects-active-home-server-contentor/<session-id>/scratchpad
SCRATCH=<scratchpad path>; mkdir -p "$SCRATCH"
FIRST=$(git log --format=%H --grep='feat(design): shared token sheet for the premium look' -n1)
[ -n "$FIRST" ] || FIRST=$(git log --format=%H -- packages/shared/src/styles/tokens.css | tail -1)
BASE=$(git rev-parse "$FIRST^")
SHA=$(git rev-parse HEAD)
echo "BASE=$BASE SHA=$SHA"; git log --oneline "$BASE..HEAD" | wc -l
```

Expected: `FIRST` is Phase 0 Task 1's commit (`git show -s --format=%s $FIRST` prints `feat(design): shared token sheet for the premium look, with a contrast test`); the count is roughly 30–45 commits (Phases 0–4). Write `BASE` and `SHA` into `$SCRATCH/ship.env` as `export BASE=… SHA=…` so later tasks `source` it.

- [ ] **Step 2: Clean-tree check for the phase's paths only**

```bash
git status --porcelain -- packages/shared frontend-main frontend-customer/src/styles \
  frontend-customer/src/app/layout.tsx frontend-customer/src/app/admin frontend-customer/src/components/admin \
  frontend-customer/src/components/ui frontend-customer/src/components/shared frontend-customer/package.json \
  frontend-customer/package-lock.json scripts/footage e2e/impact-map.json docs/superpowers
```

Expected: no output. A listed path is either yours (commit it with the owning phase's commit message, then redo Step 1) or a peer's (today, for example, `?? frontend-customer/pnpm-workspace.yaml` is not ours): leave it; the worktree deploy ignores it. Paths outside this list (`backend/…`, other peers' work) are not this phase's concern.

- [ ] **Step 3: Media is committed, within budget, and the image carries it**

```bash
git ls-files frontend-main/public/media | wc -l
find frontend-main/public/media -type f | wc -l
du -sm frontend-main/public/media | cut -f1
grep -n 'COPY --from=builder /app/public ./public' frontend-main/Dockerfile
grep -n 'public' .dockerignore frontend-main/.dockerignore 2>/dev/null || echo "public/ is not dockerignored"
jq -r '.items | to_entries[] | select(.value.kind != "still") | "\(.key) \(.value.bytes)"' frontend-main/public/media/media.json | awk '$2 > 2000000 && $1 != "hero-looks"'
# Studio footage must post-date the Phase 4 re-skin (Phase 1, "Studio footage shows the studio as it looks when recorded").
[ "$(git log -1 --format=%ct -- frontend-main/public/media/clips/loop-courses.mp4)" -ge "$(git log -1 --format=%ct -- frontend-customer/src/components/admin)" ] \
  && echo "studio footage is current" || echo "RE-RECORD studio footage (Phase 1 Tasks 4-7)"
```

Expected: the two counts are equal and > 0; the size is ≤ 35; the `COPY` line is printed (line 47 today); "public/ is not dockerignored"; the `jq` line prints nothing (no non-hero clip over 2 MB); the last line reads `studio footage is current`. If it says RE-RECORD, check `git log -3 -- frontend-customer/src/components/admin`. A peer's later unrelated commit there is a false alarm. A Phase 4 commit means re-running Phase 1 Tasks 4–7 and Task 9's commit before deploying. If the counts differ, `git add frontend-main/public/media && git commit -m "feat(media): track the footage the landing references"` — if pre-commit's `check-added-large-files` blocks it, commit with `SKIP=check-added-large-files git commit …` (that hook's only job is the 1 MB default; the budget test is the real cap), then redo Step 1.

- [ ] **Step 4: Make the deploy worktree**

```bash
source "$SCRATCH/ship.env"
DEPLOY_BASE="$SCRATCH/deploy"; W="$DEPLOY_BASE/contentor"
mkdir -p "$DEPLOY_BASE"
git worktree add --detach "$W" "$SHA"
ls "$W/frontend-main/public/media/posters" | head -3
ls -la "$W/.env" 2>/dev/null && echo "REMOVE THIS SYMLINK BEFORE DEPLOY" || echo "no .env in the worktree: good"
echo "export DEPLOY_BASE=$DEPLOY_BASE W=$W" >> "$SCRATCH/ship.env"
```

Expected: `Preparing worktree (detached HEAD <sha>)`; three poster filenames; "no .env in the worktree: good". (Another session's old deploy worktree may exist under a different scratchpad — `git worktree list | grep /deploy/contentor` — do not touch it.)

- [ ] **Step 5: Typecheck the committed tree in fresh containers**

The running containers' `npm run typecheck` can pass on a stale incremental build (memory `reference-typecheck-the-committed-tree`); run the images fresh with the worktree mounted:

```bash
source "$SCRATCH/ship.env"
docker run --rm -v "$W/frontend-main/src:/app/src" -v "$W/frontend-main/messages:/app/messages" \
  -v "$W/frontend-main/public:/app/public" -v "$W/packages:/packages" \
  -v "$W/frontend-main/tsconfig.json:/app/tsconfig.json" -v "$W/frontend-main/tailwind.config.ts:/app/tailwind.config.ts" \
  --entrypoint sh contentor-nextjs-main -c 'npm run typecheck'
docker run --rm -v "$W/frontend-customer/src:/app/src" -v "$W/frontend-customer/messages:/app/messages" \
  -v "$W/frontend-customer/public:/app/public" -v "$W/packages:/packages" \
  -v "$W/frontend-customer/tsconfig.json:/app/tsconfig.json" -v "$W/frontend-customer/tailwind.config.ts:/app/tailwind.config.ts" \
  --entrypoint sh contentor-nextjs-customer -c 'npm run typecheck'
```

Expected: both end with `tsc --noEmit` and exit 0, no `error TS` lines. (Images are the dev stack's `contentor-nextjs-main` / `contentor-nextjs-customer`, rebuilt in Phase 0 Task 4 so `geist` is present.)

- [ ] **Step 6: Lint and frontend unit tests on the main checkout**

Run one after the other:

```bash
make lint
git status --porcelain | grep -v '^??' || echo "lint changed nothing tracked"
make test-frontend
```

Expected: `make lint` exits 0 (pre-commit all hooks `Passed`, `sync_sections --check` ok, loading-pattern check ok, selector self-test ok, both typechecks clean). The `git status` line prints only files you own or "lint changed nothing tracked" — if prettier touched a peer's file, leave it. `make test-frontend`: `frontend-customer` suite passes; `frontend-main` passes with at least `tokens-contrast` (19), `preset` (2), `scrub-bands` (5) and `media-budget` (Phase 1) tests.

- [ ] **Step 7: Backend test plan for the range**

```bash
source "$SCRATCH/ship.env"
make test-changed BASE="$BASE" PLAN=1 | tail -3
git diff --stat "$BASE..HEAD" -- 'backend/**/migrations/*.py' | tail -1
```

Expected: a line `plan: backend=none …` (the premium look touches no Django app) and an empty migrations diff (the rollback in Task 10 is then a pure code swap). If the plan is not `backend=none`, run it now — `make test-changed BASE="$BASE"` — and expect it green; if a migration exists, stop and tell the owner before Task 7 (a rollback would need a reverse migration).

---

### Task 2: e2e gate, one spec at a time

**Files:** none changed. Specs: `e2e/specs/{00-smoke,02-courses,05-media,11-login-code,25-navigation-feedback,27-nav-stage-gating,01-signup-onboarding}.spec.ts`.

**Interfaces:**

- Consumes: the running dev stack serving the main checkout at `HEAD` (`make health-check` → `OK`).

- [ ] **Step 1: Confirm the selector's view and that nothing heavy runs**

```bash
source "$SCRATCH/ship.env"
make e2e-changed BASE="$BASE" PLAN=1 | tail -4
pgrep -fl 'playwright test|pytest|next build' || echo clear
make health-check
docker inspect contentor-django-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
```

Expected: `plan: … e2e=all` (any `packages/shared` path fails closed to every spec; per spec §7 the phases' agreed set below is run instead of the full suite), `clear`, `OK`, and the working_dir is the main checkout (`/Users/tahayusufkomur/ws/projects-active/home-server/contentor`) — if a peer has the stack swapped to a worktree, wait; never swap under a running spec.

- [ ] **Step 2: Run the six quick specs, strictly one after another**

```bash
for S in 00-smoke 02-courses 05-media 11-login-code 25-navigation-feedback 27-nav-stage-gating; do
  pgrep -f 'playwright test' >/dev/null && { echo "another spec is running"; break; }
  make e2e-spec SPEC=$S || { echo "FAILED: $S"; break; }
done
```

Expected: each ends with `N passed` (Playwright's summary; `retries: 1` so `1 flaky` is tolerable, a `failed` is not). On a blank-page or `waitForResponse` failure check `docker inspect contentor-nextjs-customer-1 --format '{{.RestartCount}} {{.State.OOMKilled}} {{.State.StartedAt}}'` and `docker compose logs caddy --since 20m | grep -c '"status":502'` first (memory `reference-e2e-502-flakiness`): a fresh `StartedAt` means a transient 502, re-run that spec once on a healthy stack before debugging.

- [ ] **Step 3: Run `01-signup-onboarding` last**

```bash
pgrep -f 'playwright test' >/dev/null && echo "wait" || make e2e-spec SPEC=01-signup-onboarding
```

Expected: passes, ~45 min on this VM; exactly one of its two provisioning tests tripping the 120 s `waitForReady` and passing on retry ("flaky") is baseline (memory), not a regression. A deterministic failure in the signup shell or `/setup` is ours (Phase 3 touched `SignupShell`): fix on the branch, commit with the owning phase's message, redo Task 1 Steps 1, 4 and 5, then re-run this spec.

---

### Task 3: Visual pass in the browser pane

**Files:** none changed. Screenshots are looked at, not saved (the pane returns them inline).

**Interfaces:**

- Consumes: `issue_login_token` (`backend/apps/accounts/management/commands/issue_login_token.py`: `--role superadmin|coach|student [--tenant <slug>]`, prints a JWT).

- [ ] **Step 1: Marketing pages at three widths, light only**

In the Claude Browser pane, for each URL `http://localhost/`, `/pricing`, `/blog`, `/login`, `/signup`:

1. `mcp__Claude_Browser__navigate url=<url>`
2. `mcp__Claude_Browser__resize_window preset=mobile` → `computer action=screenshot`, then `computer action=scroll scroll_direction=down scroll_amount=10` three times with a screenshot each (the landing is eight chapters; see all of them).
3. `resize_window width=1024 height=768` → same.
4. `resize_window width=1440 height=900` → same.
5. Finish with `resize_window preset=desktop`.

What must be true (spec 5.1, 5.4, 5.5): white paper, ink type in Geist, the only colour the brass accent on links/wordmark and the pictures; the 48 px translucent header and, on `/`, the 44 px local nav under it; hero video playing over the four-looks cut with its pause button; the two dark chapters (`#assistant`, `#money`) on the dark token set; no teal, no aurora/grid, no `glass-pane`; `/pricing` as three columns on second paper with a sticky plan row; `/blog` with the newest post as a 1440 px cover; `/login` a 420 px form with a 4:5 photograph beside it on desktop and alone on the phone; `/signup` stages on paper. At 375 nothing overflows horizontally: `mcp__Claude_Browser__javascript_tool text="document.documentElement.scrollWidth - window.innerWidth"` must print `0` on every page.

- [ ] **Step 2: The coach dashboard on the apex**

```bash
docker compose exec -T django python manage.py issue_login_token --role superadmin | tail -1
```

In the pane on `http://localhost/` run `javascript_tool`:

```js
await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
document.cookie =
  "contentor_access_token=<paste the JWT>; path=/; SameSite=Lax";
location.href = "/dashboard";
```

Screenshot at `mobile`, 1024 and 1440. Expected: `/dashboard` renders on second paper (platform cards: monogram, name in `title-2`, domain, status dot); the superadmin may own no platform, in which case the empty state renders in the new look — to see a card, request a magic link for the seeded coach instead: `curl -s -X POST http://localhost/api/v1/auth/magic-link/ -H 'Content-Type: application/json' -d '{"email":"coach@demo-yoga.test"}'` then `curl -s 'http://localhost/api/v1/dev/emails/latest/?to=coach@demo-yoga.test' | grep -o 'http[^"\\ ]*verify[^"\\ ]*' | head -1` (the sink's JSON carries the mail body; the verify link is the only URL containing `verify`) and open that link in the pane. If the sink returns 404 (the `.test` reserved-TLD guard skips the mail), record "dashboard card checked only by Phase 3's own gate" and move on.

- [ ] **Step 3: The studio at 375 and 1440, light and dark**

```bash
docker compose exec -T django python manage.py issue_login_token --role coach --tenant demo-yoga | tail -1
```

In the pane on `http://demo-yoga.localhost/` run `javascript_tool` (memory `reference-browser-pane-coach-login`: the stale httpOnly cookie must be cleared first):

```js
await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
document.cookie =
  "contentor_access_token=<paste the JWT>; path=/; SameSite=Lax";
location.href = "/admin";
```

Then, at `resize_window width=1440 height=900` and at `preset=mobile`:

1. Screenshot `/admin` (Overview: "Good morning, {name}" in `title`, the look name and palette swatches, "View site", the cards restyled flat with hairlines).
2. Flip dark: `mcp__Claude_Browser__find query="Switch to dark mode"` → `computer action=left_click ref=<ref>`; screenshot. Expected: background `oklch(0.13 0.005 80)` (near-black, warm), paper-on-ink primary button, hairlines at 10 % white; `javascript_tool text="getComputedStyle(document.documentElement).getPropertyValue('--background').trim()"` prints `oklch(0.13 0.005 80)`.
3. In each scheme open `/admin/courses`, `/admin/live`, `/admin/messages`, `/admin/media`, `/admin/settings` and scroll each once (spec §8: the font change can shift widths). Expected: no raw white/grey panels (`bg-white`, `text-gray-*`, `bg-slate-*` were swept in Phase 4), no clipped sidebar labels at 240 px, the segmented section tabs and the search/assistant pills in the top bar.
4. Flip back to light (`find query="Switch to light mode"` → click) so the seeded coach's stored choice is light again.
5. Tenant public page untouched: `navigate url=http://demo-yoga.localhost/` then `javascript_tool text="document.getElementById('tenant-theme').media"` → `""` (the tenant sheet is active) and the page wears the look's own font and colours, not Geist on white.

Fix anything found on the branch with the owning phase's commit message; then redo Task 1 Steps 1, 4 and 5 (the worktree must be re-made at the new `HEAD`: `git worktree remove "$W"` first).

---

### Task 4: Reduced motion, media weight, JS weight, Safari

**Files:**

- Create (scratch): `$SCRATCH/landing-check.cjs`

**Interfaces:**

- Produces: one JSON line per run `{ url, width, reduce, mediaMB, jsKB_gzip, videoFiles, sectionsHidden }`; Task 8 Step 5 re-runs it against prod.

- [ ] **Step 1: Write the check script**

```js
// $SCRATCH/landing-check.cjs — reduced-motion, media-weight and JS-weight check of the landing.
// usage: NODE_PATH=<repo>/e2e/node_modules node landing-check.cjs <url> <width> [reduce]
const { chromium } = require("@playwright/test");

(async () => {
  const [url = "http://localhost/", w = "1440", mode = ""] =
    process.argv.slice(2);
  const width = Number(w);
  const reduce = mode === "reduce";
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height: width < 768 ? 812 : 900 },
  });
  await page.emulateMedia({
    reducedMotion: reduce ? "reduce" : "no-preference",
  });

  let media = 0;
  const videos = new Set();
  page.on("response", async (r) => {
    const p = new URL(r.url()).pathname;
    if (!p.startsWith("/media/")) return;
    const body = await r.body().catch(() => null); // clips/posters are stored, not compressed: body == bytes on the wire (a cancelled range read counts 0: a lower bound)
    media += body ? body.length : 0;
    if (/\.(mp4|webm)$/.test(p)) videos.add(p);
  });

  await page.goto(url, { waitUntil: "load" });
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= height; y += 400) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(3000); // MediaVideo loads after idle; ScrollScrub one screen ahead

  const jsBytes = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter(
        (e) => e.name.includes("/_next/static/") && e.name.endsWith(".js"),
      )
      .reduce((s, e) => s + e.encodedBodySize, 0),
  );
  const sectionsHidden = await page.$$eval(
    "section",
    (els) =>
      els.filter((e) => {
        const s = getComputedStyle(e);
        return s.opacity === "0" || s.visibility === "hidden";
      }).length,
  );

  console.log(
    JSON.stringify({
      url,
      width,
      reduce,
      mediaMB: +(media / 1e6).toFixed(2),
      jsKB_gzip: Math.round(jsBytes / 1024),
      videoFiles: [...videos].sort(),
      sectionsHidden,
    }),
  );
  await browser.close();
})();
```

- [ ] **Step 2: Run it on dev — desktop, phone, reduced motion**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
export NODE_PATH=$PWD/e2e/node_modules
node "$SCRATCH/landing-check.cjs" http://localhost/ 1440
node "$SCRATCH/landing-check.cjs" http://localhost/ 375
node "$SCRATCH/landing-check.cjs" http://localhost/ 1440 reduce
```

Expected, in order: `mediaMB` ≤ 8 with `videoFiles` listing the hero, two scrub clips and the loops; `mediaMB` ≤ 4 with the `-phone.mp4` encodes in `videoFiles`; with `reduce`: `videoFiles: []` and `sectionsHidden: 0` (every chapter visible, no video requested — spec 5.7). `jsKB_gzip` is meaningless on the dev server (unminified); it is measured on prod in Task 8 Step 5. A `mediaMB` over budget is a Phase 1/2 defect: shorten the clip (spec §8: never raise the cap), re-encode, commit, redo Task 1 Steps 1, 4–6.

- [ ] **Step 3: Safari once, on the Mac**

```bash
open -a Safari http://localhost/
```

Then with computer-use: `mcp__computer-use__request_access` for `Safari` (granted at the "read" tier: screenshots only), `mcp__computer-use__app_screenshot` of Safari, wait 3 s, screenshot again. Expected: the hero frame differs between the two shots (muted + `playsInline` autoplay works; spec §8 "Safari autoplay"). For the scrub chapter try `osascript -e 'tell application "Safari" to do JavaScript "window.scrollTo(0, 1800)" in document 1'` then screenshot twice with a further `scrollTo(0, 2600)` between: the stage's frame and caption must change. If osascript answers `Allow JavaScript from Apple Events` is off, ask the owner to scroll chapter 2 in that Safari window and say whether the video frame follows the scroll; record the answer. Close the tab afterwards.

---

### Task 5: Lighthouse and the axe pass through the Chrome DevTools MCP

**Files:**

- Create (scratch): `$SCRATCH/lh/` reports

**Interfaces:**

- Consumes: Chrome DevTools MCP tools `new_page`, `resize_page`, `emulate`, `performance_start_trace`, `performance_stop_trace`, `lighthouse_audit`, `list_console_messages`, `take_snapshot`, `click`, `evaluate_script` (load with one `ToolSearch` `select:` call). Lighthouse's accessibility category is axe-core, so it is the "axe pass" (skill `chrome-devtools-mcp:a11y-debugging`, workflow 1).

- [ ] **Step 1: Landing, desktop**

1. `new_page url="http://localhost/"` → note `pageId`.
2. `resize_page pageId width=1440 height=900`; `emulate pageId networkConditions` omitted, `cpuThrottlingRate=1`.
3. `performance_start_trace pageId reload=true autoStop=true`. Expected in the result: `LCP` ≤ 2500 ms with the LCP element being the hero poster `<img>`, `CLS` ≤ 0.05.
4. INP: `performance_start_trace pageId reload=false autoStop=false`; `take_snapshot pageId`; `click` the first FAQ accordion button's `uid` and the local-nav "Pricing" anchor; `performance_stop_trace pageId`. Expected: `INP` ≤ 200 ms (if the summary says no interaction was recorded, repeat the clicks before stopping).
5. `lighthouse_audit pageId device="desktop" mode="navigation" outputDirPath="$SCRATCH/lh/landing-desktop"`. Expected: accessibility `1.0`, best-practices and SEO ≥ 0.9. For anything below 1 on accessibility:
   ```bash
   node -e "const r=require(process.argv[1]); Object.values(r.audits).filter(a=>a.score!==null&&a.score<1).forEach(a=>console.log(JSON.stringify({id:a.id,title:a.title,items:(a.details&&a.details.items||[]).map(i=>i.node&&i.node.selector)})))" "$(ls $SCRATCH/lh/landing-desktop/*.json | head -1)"
   ```
6. `list_console_messages pageId types=["issue"] includePreservedMessages=true`. Expected: no "Low contrast", no ARIA issues (the token contrast test guarantees the pairs; this catches text over images).

- [ ] **Step 2: Landing, phone**

`emulate pageId viewport="375x812x3,mobile,touch" networkConditions="Slow 4G" cpuThrottlingRate=4` (Lighthouse's mobile profile), then repeat Step 1's items 3–5 with `device="mobile"` and `outputDirPath="$SCRATCH/lh/landing-mobile"`. Expected: the same budgets; the LCP element is still the poster (the phone encode never loads before `load`). Reset with `emulate pageId viewport="" networkConditions` omitted `cpuThrottlingRate=1`.

- [ ] **Step 3: Pricing and the studio Overview**

Pricing: `navigate_page pageId type="url" url="http://localhost/pricing"`, then Step 1 items 3, 5 and 6 (desktop) and Step 2 (mobile).

Studio Overview (behind auth; this Chrome shares no cookies with the pane): `navigate_page … url="http://demo-yoga.localhost/"`, then

```
evaluate_script pageId function="async () => { await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}); document.cookie='contentor_access_token=<JWT from Task 3 Step 3>; path=/; SameSite=Lax'; return document.cookie.includes('contentor_access_token'); }"
```

→ `true`; `navigate_page … url="http://demo-yoga.localhost/admin"`; Step 1 items 3, 5 and 6 at 1440 and Step 2 at 375. Expected: CLS ≤ 0.05 (the Overview's cards keep their skeleton heights), accessibility `1.0`, no low-contrast issues in either scheme (flip dark with `click` on the sidebar button named "Switch to dark mode", re-run item 6, flip back).

Dev caveat to write into the report: dev serves unminified JS, so TBT/INP read worse than prod; LCP, CLS, accessibility and contrast are valid here. The JS budget is measured on prod in Task 8 Step 5.

---

### Task 6: Whole-branch review, then fix criticals

**Files:** whatever the review finds; each fix is its own commit on the branch.

**Interfaces:**

- Consumes: `BASE`, `SHA` from `$SCRATCH/ship.env`.

- [ ] **Step 1: Spawn one read-only reviewer**

`Agent subagent_type="general-purpose" run_in_background=false` with this prompt (fill in the two SHAs):

```
Review the commit range <BASE>..<SHA> in /Users/tahayusufkomur/ws/projects-active/home-server/contentor read-only (no edits, no tests, no docker). The contract is docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md; the plans are docs/superpowers/plans/2026-10-14-premium-phase-*.md. Start with `git log --oneline <BASE>..<SHA>` and `git diff --stat <BASE>..<SHA>`, then read the diff file by file.
Report, ranked Critical / Major / Minor, each with file:line and a one-line fix:
1. Token names changed or a primitive in packages/shared/src/ui that no longer reads its token (spec D7).
2. Raw colour utilities or hex left in frontend-customer/src/app/admin or src/components/admin (spec 5.6 sweep).
3. Any animation or video without a reduced-motion path; ScrollScrub/MediaVideo requesting a file under reduced motion (spec 5.7).
4. Internal navigation via raw next/link or router.push instead of <NavLink>/useNavigate(); raw animate-spin/Loader2 (root CLAUDE.md conventions).
5. A public endpoint or Next route whose auth changed; anything touching the tenant public pages' theme sheet or the superadmin console (spec D1, 9).
6. The media manifest: a referenced file missing from the commit, a clip over 2 MB or hero over 3 MB, or a public/media path that is not in git.
7. Copy: invented numbers or testimonials in messages/en/marketing.json (spec 5.4 chapter 7 "no invented numbers").
8. Anything in the diff that is not this project's work (a peer's hunk that got committed by mistake).
Finish with the three most likely ways a visitor or coach sees this break in production.
```

- [ ] **Step 2: Fix criticals and majors on the branch**

For each Critical (and each Major that is cheap): fix, run the owning check from Tasks 1–5 (the test, the spec, or the page), commit with the owning phase's `feat(...)`/`fix(...)` message, paths only — for example `git add frontend-customer/src/components/admin/admin-shell.tsx && git commit -m "fix(studio): the active sidebar pill reads its token in dark"`. Minors are listed in the report, not fixed here.

- [ ] **Step 3: Re-make the worktree at the new HEAD**

```bash
source "$SCRATCH/ship.env"
git worktree remove "$W"
SHA=$(git rev-parse HEAD); sed -i '' "s/^export BASE=.* SHA=.*/export BASE=$BASE SHA=$SHA/" "$SCRATCH/ship.env"
git worktree add --detach "$W" "$SHA"
```

Then redo Task 1 Steps 5 and 6 (fresh typecheck, `make lint`, `make test-frontend`) and, if a fix touched a page an e2e spec covers, that spec from Task 2. Expected: all green again.

---

### Task 7: Deploy

**Files:** none in the repo. Server: `/opt/stacks/contentor` on the active node (today `acemagic` = `taha@192.168.178.76`; standby `prodesk` = `taha@192.168.178.72`, from `~/ws/home-server/fleet/nodes.env`).

**Interfaces:**

- Consumes: `W`, `DEPLOY_BASE`, `SHA` from `$SCRATCH/ship.env`; `~/ws/home-server/deploy.sh` (`SOURCE_BASE` picks the directory whose `contentor/` subfolder is rsynced; default is the shared checkout's parent).
- Produces: `$SCRATCH/rollback-sha` (Task 10), baseline screenshots of three prod tenant homes (Task 8 Step 7).

- [ ] **Step 1: Nothing heavy is running; the stack is healthy**

```bash
pgrep -fl 'playwright test|pytest|next build|docker compose build' || echo clear
make health-check
```

Expected: `clear`, `OK`.

- [ ] **Step 2: Confirm prod billing stays on live Stripe (read only)**

```bash
~/ws/home-server/scripts/secrets.sh get contentor | grep -E '^BILLING_BYPASS_ENABLED='
```

Expected: `BILLING_BYPASS_ENABLED=false` (one Touch ID prompt for the owner; print nothing else from that stream). Any other value: stop and tell the owner; do not `set` anything in this phase.

- [ ] **Step 3: Record the rollback target**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
source "$SCRATCH/ship.env"
PREV_SHA=$(git worktree list | grep '/deploy/contentor' | grep -v "^$W " | awk '{print $2}' | head -1)
[ -n "$PREV_SHA" ] || PREV_SHA=$BASE
git show -s --format='%h %ad %s' --date=short "$PREV_SHA"
echo "$PREV_SHA" > "$SCRATCH/rollback-sha"
```

Expected: a short SHA with today's or yesterday's date (the last deploy worktree another session left behind, `8595560d` on 2026-10-14; else the branch base). Confirm it is what prod runs — read-only, checksum rsync of one directory against the active node:

```bash
ACTIVE=$(cd ~/ws/home-server && ./scripts/agent.sh active)   # prints acemagic or prodesk
. ~/ws/home-server/fleet/nodes.env; eval "HOST=\$NODE_$ACTIVE"; echo "$ACTIVE = $HOST"
git worktree add --detach "$SCRATCH/rollback/contentor" "$PREV_SHA"
rsync -rcn --itemize-changes "$SCRATCH/rollback/contentor/frontend-main/src/" "$HOST:/opt/stacks/contentor/frontend-main/src/" | grep -c '^>f' || true
```

Expected: `0` (no content differences: that commit's `frontend-main/src` is what prod serves). A non-zero count means the owner deployed something else since; ask which commit is live before continuing. Keep the `rollback/contentor` worktree for Task 10.

- [ ] **Step 4: Baseline the prod tenant sites (Review Focus 5)**

Read-only SQL through the connector (`mcp__awesome-connectors__describe_connector name="home-server-pg"` first, then `mcp__awesome-connectors__call` on `POST /databases/contentor-postgres/query` with body `{"sql": "select domain from public.core_domain where is_primary order by domain limit 25", "readOnly": true}`). Expected: up to 25 hostnames such as `demo-yoga.contentor.app`.

Pick `demo-yoga.contentor.app` and two others on visibly different looks. For each, in the browser pane: `navigate url=https://<domain>/` at `resize_window width=1440 height=900`, screenshot, scroll once, screenshot; note the fonts and colours. Also `curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/` → `200` for all three.

- [ ] **Step 5: Choose the deploy form**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
git status --porcelain | wc -l
ls -la "$W/.env" 2>/dev/null || echo "worktree has no .env: safe to rsync"
```

- `0` dirty paths and `git rev-parse HEAD` = `SHA` → the shared checkout _is_ the commit: use **`make deploy`** (it runs the full backend suite, pausing the Next dev servers, then `~/ws/home-server/deploy.sh contentor`). Do not run `make test` before it.
- Otherwise (the normal case: peers' uncommitted files, like `frontend-customer/pnpm-workspace.yaml` today) → the **worktree form** in Step 6. The backend gate is Task 1 Step 7 (`backend=none`, or its plan already run).

- [ ] **Step 6: Run the deploy (worktree form)**

From `~/ws/home-server`, in the background (`Bash run_in_background=true`, so the owner can answer Touch ID and the session stays usable):

```bash
cd ~/ws/home-server && SOURCE_BASE="$DEPLOY_BASE" ./deploy.sh contentor
```

What the owner sees first: the `touchid-helper` prompt for the Keychain item `fleet-cf-token` (the Cloudflare KV token). It comes before any server change; if declined, the script dies with `Cloudflare KV secrets unavailable` and nothing moved.

Expected output, in order (read it with the background task's result, or `Monitor`): `==> [contentor] failover group active on acemagic (load balancers: both)`; no `WARN: deploying an uncommitted working tree` (the worktree is clean); `snapshot previous release`; `rsync -> …` (thousands of itemized lines from a fresh worktree are mtime-only resends — harmless); `env -> RAM /dev/shm/.env.contentor (Cloudflare KV) — nothing on disk`; `build` (the two Next.js images; several minutes); `drain acemagic from the load balancer`; `up`; `status` (every service `Up`/`healthy`); `health via edge net (Host: contentor.app -> contentor-caddy/api/health/)` → `HTTP 200`; `acemagic back into the load balancer`; `done on acemagic.`; `fleet overlay`; then the standby run: `images: the active node's, by exact ID (no build on prodesk)`, its `up`, `HTTP 200`, `done on prodesk.`

If the tool denies the command ("[Production Deploy]" classifier, Review Focus 4): stop, and hand the owner exactly `cd ~/ws/home-server && SOURCE_BASE=<DEPLOY_BASE> ./deploy.sh contentor` to run in their terminal; wait for them to say it finished, then continue with Step 7. Never substitute `FLEET_CF_SECRETS` from server RAM.

If the health probe fails, `deploy.sh` rolls back by itself (`rollback_release`: the `/opt/stacks/.deploy-prev/contentor` snapshot plus the `rollback/contentor-<service>:prev` image tags) and prints `ROLLED BACK to previous release (health: HTTP 200)`; prod is then unchanged — read the build/up output for the cause before trying again.

- [ ] **Step 7: Both nodes healthy**

```bash
cd ~/ws/home-server && ./scripts/ha.sh status
```

Expected: two `contentor` rows — `acemagic` and `prodesk` — each with a non-zero container count and `HTTP 200`; both `node-health` lines `HTTP 200`; the agent status shows the standby `ready=True` with no `NOT READY` check. A `standby prodesk failed` from Step 6 means the active node is live and healthy and only the replica tier lagged: check `ssh taha@192.168.178.72 'docker logs fleet-agent --since 30m' | grep '\[contentor\]'` (memory `reference-ha-deploy-standby-race`) and re-run Step 6 once.

---

### Task 8: Post-deploy verification

**Files:** none changed.

**Interfaces:**

- Consumes: `frontend-main/public/media/media.json` (committed), `frontend-main/messages/en/marketing.json` (committed), `$SCRATCH/landing-check.cjs` (Task 4), the three tenant baselines (Task 7 Step 4).

- [ ] **Step 1: Health on the apex and a tenant**

```bash
curl -sS https://contentor.app/api/health/; echo
curl -sS https://demo-yoga.contentor.app/api/health/; echo
curl -sS -o /dev/null -w '%{http_code}\n' https://demo-yoga.contentor.app/
```

Expected: `{"status": "ok", "db": "ok", "redis": "ok"}` twice and `200`. (If `demo-yoga` is gone from prod, use the first domain from Task 7 Step 4.)

- [ ] **Step 2: The build carries the new copy**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
HERO=$(jq -r '.hero | .. | strings' frontend-main/messages/en/marketing.json | grep -v "'" | awk 'length > 15' | head -1)
# Phase 2 may have renamed the hero block: fall back to any long apostrophe-free line of the file
[ -n "$HERO" ] || HERO=$(jq -r '.. | strings' frontend-main/messages/en/marketing.json | grep -v "'" | awk 'length > 30' | head -1)
test -n "$HERO" && echo "checking: $HERO"
curl -s https://contentor.app/ | grep -c "$HERO"
curl -s https://contentor.app/ | grep -c 'oklch(0.55 0.15 195)'
```

Expected: the hero line printed (a Phase 2 string from `marketing.json`, chosen without an apostrophe so HTML escaping cannot hide it), then `1` or more, then `0` (the old teal accent is gone from the served page). A `0` on the hero means prod still serves the old build: check `ssh taha@192.168.178.76 'cd /opt/stacks/contentor && docker compose -f docker-compose.prod.yml --env-file .env.prod ps nextjs-main'` for a fresh `Created` time.

- [ ] **Step 3: The Cloudflare media cache rule hits (MISS then HIT)**

```bash
POSTER=$(jq -r '.items["hero-looks"].poster' frontend-main/public/media/media.json); echo "$POSTER"
curl -sI "https://contentor.app$POSTER" | grep -iE 'HTTP/|cf-cache-status|content-type|content-length'
sleep 2
curl -sI "https://contentor.app$POSTER" | grep -i cf-cache-status
CLIP=$(jq -r '.items["hero-looks"].src' frontend-main/public/media/media.json)
curl -sI "https://contentor.app$CLIP" | grep -iE 'HTTP/|cf-cache-status|content-type|accept-ranges'
```

Expected: `HTTP/2 200`, `content-type: image/avif`, `cf-cache-status: MISS` on the first call and `HIT` on the second; the clip answers `200`, `video/mp4`, `accept-ranges: bytes`. `cf-cache-status: DYNAMIC` on both calls means Phase 2's rule is missing or ordered below a bypass rule: in the Cloudflare dashboard (contentor.app → Caching → Cache Rules) the rule must match `(http.host eq "contentor.app" and starts_with(http.request.uri.path, "/media/"))`, Edge TTL "Ignore cache-control header and use this TTL → 7 days", Browser TTL "Override origin → 1 day", placed above any `/api/*` bypass — the Pix4Less "videos" rule (`../pix4less/docs/cloudflare-cache-rules.md`, Rule 2) is the model. Re-run the two `curl -sI` calls after saving.

- [ ] **Step 4: The `media.json` cache policy holds (Review Focus 1)**

```bash
grep -rn 'media.json' frontend-main/src | grep -v __tests__
curl -s "https://contentor.app/media/media.json?v=$(git rev-parse --short HEAD)" | shasum
shasum < frontend-main/public/media/media.json
curl -sI https://contentor.app/media/media.json | grep -i cf-cache-status
```

Expected: the grep shows only the build-time `import` in `frontend-main/src/lib/media.ts` (no `fetch(`), the two checksums are equal (the cache-busting query string bypasses the edge copy, so this proves the deploy carried the committed manifest), and the last line may read `HIT` — a stale edge copy of `media.json` is harmless because nothing fetches it at runtime. Policy, to keep: a re-encoded clip gets a new filename and `media.json` points at it; if a published name is ever overwritten, purge `contentor.app/media/` by prefix in the dashboard (Caching → Configuration → Purge Cache → Custom Purge → Prefix).

- [ ] **Step 5: Budgets on the production build**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
export NODE_PATH=$PWD/e2e/node_modules
node "$SCRATCH/landing-check.cjs" https://contentor.app/ 1440
node "$SCRATCH/landing-check.cjs" https://contentor.app/ 375
```

Expected: `jsKB_gzip` ≤ 250 on the desktop run (spec 5.7; Cloudflare compresses text, `encodedBodySize` is the compressed size); `mediaMB` ≤ 8 and ≤ 4 as in Task 4. Then with the Chrome DevTools MCP: `new_page url="https://contentor.app/"`, `performance_start_trace reload=true autoStop=true` at 1440 and, after `emulate viewport="375x812x3,mobile,touch" networkConditions="Slow 4G" cpuThrottlingRate=4`, again. Expected: LCP ≤ 2500 ms, CLS ≤ 0.05 — the cold load also shows the poster request with `cf-cache-status: HIT` in `list_network_requests` (spec §7 "a cold load with DevTools showing the media cache rule hitting").

- [ ] **Step 6: Prod screenshots of the public pages**

Browser pane: `navigate url=https://contentor.app/`, `/pricing`, `/login` at `resize_window width=1440 height=900` and `preset=mobile`; scroll `/` through all eight chapters. Expected: identical to the dev pass in Task 3 Step 1 — paper, ink, brass, Geist, hero video playing, dark chapters dark; no 404 posters (a grey `bg-muted` tile where a picture should be is a missing file — Review Focus 2/3; check `curl -sI https://contentor.app<path>` for the tile's `src` from `media.json`).

- [ ] **Step 7: The three prod tenant sites are unchanged (Review Focus 5)**

Repeat Task 7 Step 4's screenshots for the same three domains at 1440 and compare with the baselines. Expected: identical fonts, colours and layout (their theme sheets override `:root`; Geist and the shared tokens must not show). Any difference is a Critical: go to Task 10.

- [ ] **Step 8: The studio Overview on prod**

Only the owner can log into a prod studio (prod logins go through superadmin "Log in as", memory `project-single-test-tenant`). Ask the owner to open their own tenant's `/admin` in the browser pane (or to send a screenshot) and look at: the welcome header in `title`, the look name and swatches, the flat hairline cards, the sidebar pill, light and dark. If the owner is not available, write "studio Overview on prod: unverified by me; dev-verified in Task 3 Step 3" in the report — do not claim it.

---

### Task 9: Docs and the shipped-plan cleanup

**Files:**

- Modify: `docs/PRODUCT.md` (section 2 table, section 4 decision log)
- Modify: `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md:3` (status line)
- Delete (second commit): `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md`, `docs/superpowers/plans/2026-10-14-premium-phase-{0,1,2,3,4,5}-*.md`
- Modify (only if the generator runs): `docs/wiki/**`

**Interfaces:**

- Consumes: the deploy date from Task 7.

- [ ] **Step 1: Refresh the architecture wiki — or report that the generator is broken**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
tail -3 .gitnexus/wiki-refresh.log
ls .gitnexus/wiki | wc -l
make wiki
```

Expected: `make wiki` runs `analyze`, `wiki`, then `wiki-sync`, and `git status --porcelain docs/wiki | wc -l` is > 0. Known state on 2026-10-14: the post-commit hook's refresh failed at 16:07 with `Error: Cannot read properties of undefined (reading 'replace')` (exit 2). If `make wiki` fails the same way: do **not** run `make wiki-sync` (`.gitnexus/wiki/` dates from 2026-08-03 and the sync's `--delete` would mirror that stale generation over `docs/wiki/`), leave `docs/wiki` untouched, and put the error in the report for the owner. If it succeeds:

```bash
git add docs/wiki && git commit -m "docs: refresh the architecture wiki after the premium look"
```

- [ ] **Step 2: PRODUCT.md — the inventory row and the decision**

Add this row at the end of the section 2 table (after the "Monitoring" row, line 56 today), with the real deploy date:

```markdown
| Premium marketing site + studio look (shared token sheet, Geist, brass accent, chapter landing on real product footage, re-skinned studio shell + primitives) | live-in-prod | deployed <YYYY-MM-DD> on both nodes; prod-verified: health, landing/pricing/login screenshots at 1440 + 375, media cache rule MISS→HIT, LCP/CLS/JS budgets; studio Overview <owner-verified | dev-verified only>; media ≤ 35 MB guarded by `frontend-main/src/lib/__tests__/media-budget.test.ts`; spec `2026-10-14-premium-marketing-and-studio-design.md` (removed after shipping, in git history) |
```

Append to section 4 (append-only):

```markdown
- 2026-10-14: **the coach-facing surfaces leave the s3Administrator house design system** (spec D2) — light-first monochrome, brass accent, Geist in both apps, token _names_ unchanged. Marketing renders light always (D4); the studio keeps the coach's one light/dark choice. A future session must not "restore" the house tokens in Contentor.
```

- [ ] **Step 3: Spec status line, then commit the docs**

Line 3 of the spec reads `Date: 2026-10-14 · Status: approved in conversation by the owner 2026-10-14; spec awaiting the owner's review` plus whatever Phases 0–4 appended. Append ` · Phase 5 done <YYYY-MM-DD>: deployed to prod (both nodes) and verified`.

```bash
git add docs/PRODUCT.md docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md
git commit -m "docs: the premium look is live in prod; inventory row, decision and spec status"
```

Expected: pre-commit passes (`trailing-whitespace`, `end-of-file-fixer`, prettier on Markdown).

- [ ] **Step 4: Remove the shipped spec and plans**

Repo convention (root `CLAUDE.md`, Active Documentation): `docs/superpowers/plans|specs/` hold in-progress work only; shipped ones are deleted, not archived — the commit above keeps the completion record in history.

```bash
# git ls-files expands its own pattern, so a phase whose plan was never written does not abort the command
git ls-files 'docs/superpowers/plans/2026-10-14-premium-phase-*.md' \
  docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md | xargs git rm
git commit -m "docs: remove the premium-look spec and phase plans now that they have shipped"
```

Expected: up to seven files removed (six plans and the spec; fewer means a phase's plan was never committed).

- [ ] **Step 5: Tidy the worktrees**

```bash
source "$SCRATCH/ship.env"
git worktree remove "$W"
git worktree remove "$SCRATCH/rollback/contentor" 2>/dev/null || true
git worktree prune
git log --oneline -4
```

Expected: the two docs commits (and the wiki commit if any) on top of the shipped `SHA`; `git worktree list` no longer shows this session's scratchpad paths. Report to the owner: what was deployed (`SHA`), what was verified on prod, what was not (Task 8 Step 8 if unverified, the wiki generator if broken), and that nothing was pushed to the remote.

---

### Task 10: Rollback (only if prod is wrong)

**Files:** none in the repo. Uses the `rollback/contentor` worktree from Task 7 Step 3.

**Interfaces:**

- Consumes: `$SCRATCH/rollback-sha` (the commit prod ran before this deploy).

- [ ] **Step 1: Redeploy the previous commit**

`deploy.sh` has no "deploy the last release" switch: its own rollback (`rollback_release`, the `/opt/stacks/.deploy-prev/contentor` snapshot plus the `rollback/contentor-<service>:prev` image tags) fires only when the health probe fails, is one generation deep and is overwritten by every deploy. A page that serves 200 but looks wrong never triggers it, so the rollback is a normal deploy of the previous commit from its own worktree:

```bash
PREV_SHA=$(cat "$SCRATCH/rollback-sha")
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
[ -d "$SCRATCH/rollback/contentor" ] || git worktree add --detach "$SCRATCH/rollback/contentor" "$PREV_SHA"
ls -la "$SCRATCH/rollback/contentor/.env" 2>/dev/null || echo "no .env: safe"
cd ~/ws/home-server && SOURCE_BASE="$SCRATCH/rollback" ./deploy.sh contentor
```

Expected: the same sequence as Task 7 Step 6 (Touch ID, snapshot, rsync, build, up, `HTTP 200`, `done on acemagic.`, standby `done on prodesk.`); the branch carries no migrations (Task 1 Step 7), so the database needs nothing. If the classifier denies it, hand the owner that exact line.

- [ ] **Step 2: Confirm prod is back**

```bash
curl -sS https://contentor.app/api/health/; echo
curl -s https://contentor.app/ | grep -c 'oklch(0.55 0.15 195)'
cd ~/ws/home-server && ./scripts/ha.sh status | grep contentor
```

Expected: health `ok`; the teal accent count is `1` or more again (the old build is live); both nodes `HTTP 200`. Screenshot `https://contentor.app/` and one tenant home in the pane. Then fix the finding on the branch, and run this plan again from Task 1.

---

## Self-review

- **Spec coverage.** §6 row "5 Ship": visual pass at 375/1024/1440 in both schemes where they apply → Task 3 (marketing light only, studio light and dark); `make deploy` → Task 7 (both forms, with the reason the worktree form is the normal one); prod screenshots → Task 8 Steps 6–8. §7: unit tests → Task 1 Step 6; `make test-changed` / `make e2e-changed PLAN=1` first → Task 1 Step 7, Task 2 Step 1; Lighthouse and axe on landing, pricing and the studio Overview → Task 5; reduced motion via emulation → Task 4 (Playwright `emulateMedia`, since neither browser MCP exposes a reduced-motion switch), Safari once → Task 4 Step 3; after deploy health on apex and a tenant, prod screenshots of landing and the studio Overview, cold load with the cache rule hitting → Task 8 Steps 1, 6, 8 and 5. §8 risks: media weight → Task 1 Step 3 and Task 4; scrub jank is Phase 2's; Safari autoplay → Task 4 Step 3; the studio touching 44 pages → Task 3 Step 3's section scroll and Task 2's five specs; VM budget → the `pgrep` gates; "exactly Apple" → the reviewer's prompt does not check it (a judgement call for the owner, noted here, not a task).
- **Placeholder scan.** Angle-bracket values remain only where the executor must paste a live value (`<paste the JWT>`, `<BASE>`/`<SHA>` in the reviewer prompt, `<YYYY-MM-DD>`, `<domain>`, `<scratchpad path>` in Task 1 Step 1 — the environment block gives it, the comment says so). No "TBD", no "similar to Task N"; every check has its command and expected output.
- **Type/name consistency.** `BASE`, `SHA`, `W`, `DEPLOY_BASE`, `PREV_SHA`, `$SCRATCH/ship.env`, `$SCRATCH/rollback-sha`, `$SCRATCH/landing-check.cjs` are used with the same names throughout; `media.json` keys (`items["hero-looks"].poster/.src`, `kind`, `bytes`) match the Phase 0 contract; the toggle's accessible name `Switch to dark mode` / `Switch to light mode` is from `packages/shared/src/ui/theme-toggle.tsx`; the e2e spec names exist in `e2e/specs/`.
- **Review Focus.** Each of the five has its pinning step: 1 → Task 8 Step 4; 2 → Task 1 Step 3 (+ Step 4's `ls`); 3 → Task 1 Step 3 and Task 8 Step 3; 4 → Task 7 Step 6; 5 → Task 7 Step 4 and Task 8 Step 7.
- **Fixed inline during the review:** the wiki refresh is broken today (log checked), so Task 9 Step 1 forbids a bare `wiki-sync`; `lighthouse_audit` in this MCP excludes performance, so LCP/CLS/INP come from `performance_start_trace` and Lighthouse is used for the axe-based accessibility pass; the dashboard login on the apex uses the superadmin token (the e2e pattern) with the magic-link sink as the fallback; `make deploy` is only correct when the shared checkout is clean, hence Step 5's fork.
