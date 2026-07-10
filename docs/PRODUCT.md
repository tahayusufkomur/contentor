# Contentor — Product Plan

> Owned by the `/po` advisor. Humans edit freely; `/po` re-verifies and re-ranks.

## 1. North star & launch-ready checklist

**Pre-launch. North star: shortest path to the FIRST PAYING COACH** (global-first: coach #1 is EN/USD — iyzico/TR explicitly NOT required for launch, per Decision log).

Launch-ready = every box checked:

- [x] Local main pushed to origin (2026-07-09, `9520a5e` — +22 commits: blog, help bot, AI brand pack; main == origin re-verified 2026-07-10)
- [x] Prod deployed to current main (re-deployed ≥ blog stack by 2026-07-10: /blog renders, platform blog API 200; earlier full deploy 2026-07-08 `b95a0b4` — containers healthy, celery self-started, landing copy-clean)
- [ ] Post-deploy prod smoke: signup → provision → build site → create course by hand (pages/API/media/calendar smoked ✓; the interactive signup+builder walkthrough needs a real inbox — user)
- [ ] Coach subscribes on LIVE Stripe (one real Starter checkout with a real card, then refund) — platform billing verified in prod
- [ ] Student buys from a coach on LIVE Stripe Connect (real test purchase, then refund) — marketplace verified in prod
- [x] Media works in prod with path-style presigns (2026-07-03: signed Hetzner URL fetched 200)
- [ ] Failed-payment handling exists at MVP level (at minimum: past-due grace works, coach sees a "payment failed" state; full dunning UI can follow)
- [ ] Secrets rotated (`.env.prod` values exposed in a past session) — `BILLING_BYPASS_ENABLED=false` confirmed 2026-07-03; rotation itself still pending (owner)
- [ ] Onboarding walkthrough survives a non-technical dry run (someone who isn't you signs up and builds a page unaided)

## 2. Feature inventory

| Feature | Status | Evidence / note |
|---|---|---|
| Signup → tenant provisioning (magic link, questionnaire, templates, authenticated flow) | live-in-prod | deployed 2026-07-03 |
| Courses / downloads / media | live-in-prod | path-style presigns smoked in prod 2026-07-03; one-step create flow (course+curriculum, priced download) deployed 2026-07-08 |
| Subscription pricing type ("included in subscription", courses+downloads) | live-in-prod | pushed `d50fdc4`; any active sub unlocks, never sold one-off; +rich-text lessons, local lesson edit, video-picker modal; 4 tests, 2 tenant migrations |
| Billing plan source-of-truth cleanup | live-in-prod | pushed `01ed71c`/`e2c4ac2`: PlatformSubscription is now the single source of a tenant's plan; superadmin plan change grants the subscription, not just the mirror; deployed 2026-07-08 |
| Live classes (GetStream), zoom classes, onsite events, calendar | live-in-prod | zoom_class fix verified in prod 2026-07-03 |
| Announcements (push/feed/email/templates/recurring) | live-in-prod | deployed 2026-06-23; coach-UI browser smoke still pending |
| Student PWA (installable, offline, web push) | live-in-prod | usage dashboards deployed 2026-07-03 |
| PWA login via emailed 6-digit code ("magic PIN") | live-in-prod | shipped 2026-07-03 (installed apps can't use link cookies); owner phone-test pending |
| Platform billing — subscribe/checkout (Stripe) | built-unverified | e2e-verified in TEST mode locally; never exercised on live keys in prod |
| Platform billing — quota enforcement (402s) | missing | quotas.py log-only; "Phase 3" handler not written |
| Platform billing — dunning/lifecycle UI, receipts, metrics | partial | webhook already maps `invoice.payment_failed`→past_due (webhooks.py); coach tile renders past_due badge; provider `create_customer_portal_session` implemented but NO endpoint/UI (platform.py: "Phase 2"); receipts/metrics missing |
| Admin-managed plan pricing (superadmin) | live-in-prod | adminkit platform-plans CRUD + provision_stripe_price swap — roadmap §15 is stale here |
| Marketplace — Stripe Connect direct charges (coach = MoR) | built-unverified | e2e-verified TEST mode; prod live-mode unverified; "don't blind-deploy" note stands |
| Marketplace — iyzico (TR) | missing | declared provider choice only; NOT needed for coach #1 (global-first) |
| Coach earnings / payouts view | partial | earnings endpoint + Connect dashboard link; no in-app payout history |
| Website builder (6 pages, blocks, autosave) | live-in-prod | deployed 2026-07-03; coach walkthrough pending |
| Filters / tags | live-in-prod | deployed 2026-07-03 |
| Coach mailbox (inbox, compose, inbound via CF Email Worker) | partial | Gmail-style inbox (folders/search/thread) + TipTap rich text + attachments both directions merged+pushed (`a24f1ff`, 2026-07-04); code deployed 2026-07-08; inbound still needs MAILBOX_INBOUND_SECRET in prod env + Email Worker redeploy; inbound requires custom domain |
| Platform inbox address (`<x>@contentor.app` for paid coaches) | live-in-prod | merged+pushed (`333ce24`, 2026-07-03); CF Email Routing + catch-all→worker wired live per memory; Django-side registry/gating deployed 2026-07-08 |
| Custom-domain onboarder (Route53 + annual sub) | partial | Phase 1 backend pushed+deployed (was in `b95a0b4`) but unreachable in practice — no coach UI until phases 2-4, prod creds unset (fakes are dev-only) |
| Impersonation (superadmin→coach, coach→student) | live-in-prod | coach→student e2e-covered |
| Superadmin panel (revenue, webhook log, adminkit) | live-in-prod | |
| Local dev/e2e infra (MinIO, fakes, sink, Playwright suite) | done (dev-only) | make e2e 17p+3s; stripe specs 2p; backend 603/603 |
| Setup assistant v2 (seed registry + fingerprints, demo badges, one-click erase, per-item setup-status checklist) | live-in-prod | deployed 2026-07-08; merged 2026-07-05 (`f66b7f1..238e086`, 16 commits, branch `feat/setup-assistant` deleted post-merge); 150/150 relevant backend suites + tsc clean; browser-walked (Playwright); supersedes old 4-step SetupGuideCard |
| Logo Studio v2 (brief → wall of 24 → canvas editor → brand-kit zip w/ vector SVG; favicon/PWA icons) | live-in-prod | deployed 2026-07-08; free path stays deterministic (zero AI cost); paid-tier AI Brand Pack reintroduced 2026-07-09 (`5995299`, see decision log) — AI path inert in prod until provider key set; human browser smoke pending |
| Community (feed/posts/reactions/moderation, phases 1-3) | live-in-prod | deployed 2026-07-08; e2e capstone spec written but never run (port 80); phase 4 (notifications) planned, not built |
| Landing copy truth-fixes (removes fake testimonials/$1M) | live-in-prod | deployed 2026-07-08; prod landing grep-verified clean of $1M/testimonial markers |
| Blog — coach-site blog (AI, plan-quota, autopilot) + platform blog (/blog + sitemap, superadmin composer) | live-in-prod | pushed 2026-07-09, curl-verified live 2026-07-10 (blog title renders, platform API 200); AI generate inert in prod until provider key set |
| Help bot "Ask Contentor" (coach in-app + anonymous marketing-site chat) | partial | code deployed but OFF in prod — `/api/v1/help/status/` → enabled:false; flip needs prod AI key/flag; sequence AFTER shared-ai-provider lands (it renames provider vars) |
| Shared AI provider (`apps/core/ai.py`, AI_PROVIDER switch, `make ai-check`) | partial | branch `feat/shared-ai-provider` (8 commits, unmerged) + uncommitted polish; blog/help-bot/logo routed through it on-branch; drops per-feature HELP_BOT_*/BLOG_AI_* vars |
| Monitoring (prometheus/grafana compose profile) | verify | is the profile actually running on the home server? |

## 3. Backlog

### Now (ranked — the money path is the launch gate)

1. **Verify the money path on live Stripe** — one real platform subscription + one real Connect purchase (then refund both). Converts the two `built-unverified` rows to `live-in-prod`; THE gate to inviting a real coach. Needs the owner's card. Deploy prerequisite CLEARED 2026-07-08. *(effort: half a day incl. webhook config)*
2. **Rotate exposed prod secrets** — `.env.prod` values were exposed in a past session; new keys from each provider dashboard (owner), then `./deploy.sh contentor` to re-env. *(effort: 1-2 hours)*
3. **Interactive prod walkthrough** — signup with a real inbox → provision → build a page → logo studio → create a course, as a coach would. Completes the smoke checklist box and doubles as the pending human smoke of the new features (studio/community/setup-assistant). *(effort: 1-2 hours)*
4. **Land `feat/shared-ai-provider` + set ONE prod AI key** — merge the branch (8 commits + uncommitted polish), then a single `.env.prod` change activates help bot, blog AI generate, and Brand Pack in prod together. Do the env AFTER the merge — the branch renames per-feature provider vars. *(effort: half a day)*
5. **MVP failed-payment handling** — smaller than thought: webhook past_due mapping + past_due badge + provider portal method already exist; remaining work = one portal endpoint + a "payment failed, update your card" banner/CTA (portal endpoint re-greped missing 2026-07-10). *(effort: 0.5-1 day)*

### Next

- **AI assistants & governance** (spec `docs/superpowers/specs/2026-07-10-ai-assistants-governance-design.md`, owner review pending): NEW student "Site assistant" (paid-tier, coach opt-in, per-tenant catalog knowledge pack) + transcripts/audit (AiTranscript, superadmin AI-usage dashboard, adminkit read-only meters) + editable KBs (coach knowledge entries, superadmin platform addenda) + thumbs ratings on all three bots. Prereqs: shared-ai-provider merge + prod AI key (both = Now #4). Five shippable phases. *(effort: ~4-6 days)*
- Quota enforcement 402s (Phase 3) — needed before coaches can hit plan limits meaningfully; pair with plan-limit copy in the coach UI.
- Non-technical onboarding dry run + fixes (the `/courses`-empty-catalog class of bug is what a real coach hits) — recruit one non-technical tester.
- Announcements coach-UI browser smoke (10 minutes, has been pending since June).
- Coach payout history in-app (beyond the Connect dashboard link).
- Platform mailbox address for PAID coaches (decision 2026-07-03) — coach picks `<x>@contentor.app`; all mail to it lands in the in-app inbox; address doubles as the site's public contact email. Pieces: public-schema address registry (unique local part, reserved list, plan-gated via adminkit flag); inbound webhook resolves registry addresses alongside custom domains; sending_identity paid tier (send-from or Reply-To the chosen address); contact-form block routes into the mailbox instead of the coach's personal email; CF apex catch-all worker (custom addresses take precedence — verify); upsell banner copy splits (free→upgrade plan; paid-no-domain→brand it). Open: address lifecycle on downgrade/cancel (must be revocable; local-part squatting guardrails). Prod still needs MAILBOX_INBOUND_SECRET + worker deploy. *(effort: 2-3 days)*
- Monitoring check: confirm prometheus/grafana actually run on the home server; add a basic uptime alert.
- ~~Deploy healthcheck permanent fix~~ — DONE in main `3dab95d` (2026-07-04): `start_period` lengthened 60s→180s so celery no longer races the demo-seed window. Verify it actually holds on the next real deploy (no manual celery start needed), then this drops off.

### Later

- Custom-domain onboarder phases 2-4 (buy-domain UX, billing, provisioning polish).
- iyzico TR marketplace (when a TR coach matters commercially).
- Dunning/receipts/metrics (billing Phase 4) beyond the MVP.
- Superadmin→coach impersonation e2e spec; minio image pin; e2e cosmetic carries (list in `.superpowers/sdd/progress.md`).
- Weekly scheduled `/po review` automation (explicitly deferred at design time).

## 4. Decision log (append-only)

- 2026-06 (REFERENCE §15/16): near-term = finish platform billing + M2 marketplace; global-first (EN/USD leads, TR follows); coach = merchant of record (Connect Express, direct charges); Free coaches can never get paid; fees Starter 5% / Pro 4%; platform keeps fee on refund; sibling-site migration and go-live push explicitly out.
- 2026-07-02: payments philosophy for dev/e2e = real Stripe TEST mode (user choice); bypass remains available via env flip.
- 2026-07-03: PO advisor scoped to Contentor only; lens = everything ship-first; stage = pre-launch, north star = first paying coach; weekly scheduled review deferred.
- 2026-07-03 (audit): admin-managed pricing recognized as already built (roadmap §15 stale); iyzico confirmed not launch-blocking.
- 2026-07-03: mailbox positioning — receiving email is a PLAN feature; custom domain is branding on top. Paid coach picks a platform address `<x>@contentor.app` (coach-chosen local part, platform-wide unique, reserved list); ALL mail to it lands in the in-app inbox; the same address is the tenant site's public contact email, and the site contact form routes into the inbox instead of the coach's personal signup email. Free coaches stay send-only.
- 2026-07-08: **Logo Studio has NO AI path — zero AI cost** (owner decision). The deterministic client-side composer is the only idea source; `ANTHROPIC_API_KEY`, the anthropic dependency, and the suggestions endpoint were removed. Do not reintroduce AI here.
- 2026-07-09 (recorded from commits 2026-07-10): the owner partially superseded the above — AI returns to Logo Studio as a **paid-tier, cost-capped Brand Pack** (`5995299`); the free logo path stays deterministic/zero-AI-cost.

## 5. Audit stamp

Last check: **2026-07-10 (/po next)** — verified: main == origin/main at `9520a5e` (0 unpushed); working tree is on branch `feat/shared-ai-provider` (8 commits unmerged + uncommitted ai_check/test polish — shared-tree caution: main is NOT checked out). Prod `/api/health/` ok; **prod is NEWER than the 07-08 stamp**: /blog renders ("Blog — Contentor") and platform blog API 200 → the 22 post-`b95a0b4` commits (blog ×16, help bot ×2, AI brand pack, docs) are pushed AND deployed. Help bot present but OFF in prod (`/api/v1/help/status/` → enabled:false, reason "disabled"). Billing portal endpoint re-greped: still missing. Corrections: checklist boxes 1-2 evidence refreshed; inventory +3 rows (blog, help bot, shared AI provider); logo-v2 row updated for the paid Brand Pack (decision-log addendum recorded from commit `5995299`); custom-domain row marked deployed-inert. Ranking: money path #1 / secrets #2 / walkthrough #3 unchanged (all owner-gated); NEW #4 = land shared-ai-provider then set one prod AI key (activates 3 dormant AI surfaces); failed-payment MVP → #5.

Earlier — Last check: **2026-07-08 (commit+push+deploy)** — pushed `b95a0b4` (main == origin); deployed via `deploy.sh contentor`: all containers healthy, **celery self-started (healthcheck fix verified in a real deploy — the manual-start gotcha is closed)**, edge 200. Post-deploy smoke: `/api/health/` ok, landing 200 + grep-clean of fake copy, tr. locale 200, tenant catch-all 200. Inventory rows flipped to live-in-prod (subscription pricing, billing source-of-truth, mailbox→partial (needs MAILBOX_INBOUND_SECRET + worker redeploy for inbound), platform inbox, setup assistant v2, logo studio v2, community 1-3, copy-truth). Now #1 (push+deploy) DONE → **Now #1 is the live-Stripe money check**, #2 secrets rotation (owner), #3 interactive prod walkthrough. Money-path rows still `built-unverified` — unchanged as the launch gate.

Earlier — Last check: **2026-07-08 (/po next — "what is left")** — verified: HEAD `95c93e9`; **local main 105 ahead / 0 behind origin** (`f66b7f1`, was 16 ahead at the 07-05 stamp — community 1-3, logo studio v1+v2 all-4-phases, navbar redesign, fast-tests, copy-truth merged locally since); prod `/api/health/` ok (db+redis ok) but prod is still the ~July-3 build → **fake testimonials remain LIVE** while their fix sits local. Corrections: launch-checklist "pushed to origin" box RE-OPENED; inventory gained Logo Studio v2 / Community 1-3 / copy-truth rows (all built-not-deployed); "push + deploy (+rotate secrets)" promoted to explicit Now #1 ahead of the live-money check (which depends on deploying the undeployed billing commits). Decision logged: no AI in Logo Studio (zero AI cost). Money-path rows unchanged (`built-unverified`) — still the launch gate.

Earlier — Last check: **2026-07-05 (/po next, later same day)** — verified: HEAD moved `3dab95d` → `238e086` since the morning stamp (setup-assistant v2 merged to local main, 16 commits, working tree clean). **Local main now 16 ahead / 0 behind origin/main** (`f66b7f1`) — the "0 ahead" from the morning stamp no longer holds; CLAUDE.md's deploy path rsyncs the local tree directly, so this doesn't block deploying, but it does mean the push-to-origin checklist box (checked 2026-07-03) is stale again and origin is not a reliable snapshot of main. Prod `/api/health/` could NOT be checked this run — no outbound network from this sandbox; treat prod status as unconfirmed, not re-verified. Feature inventory: added setup-assistant v2 row (built-not-deployed). No re-ranking: this merge doesn't touch the money-path gate, so Now list (verify live Stripe → rotate secrets → prod walkthrough → MVP failed-payment) stands unchanged. Prod deploy debt keeps growing (was ~22 commits behind on 2026-07-04, +16 more today) — worth folding "push + deploy" into an explicit Now item rather than leaving it implicit in checklist box 2.

Earlier — Last check: **2026-07-05 (/po next, re-confirm)** — verified: HEAD = `3dab95d` (unchanged since last stamp), **main == origin/main (0 ahead/0 behind)**; prod `/api/health/` = ok (db+redis ok). No new commits since the 2026-07-04-late stamp; same dev-only uncommitted tree (`Makefile`, `scripts/mirror_demo_assets.py`, dev-demo-assets spec + this doc) — demo-media mirroring tool still in progress, NOT launch-blocking. Nothing re-ranked: this is a re-confirmation, not a state change. **Prod deploy still BEHIND by ~22 commits** (prod ≈ `e24fff4` per ledger; no version endpoint to auto-confirm). Money-path gate UNCHANGED (both Stripe rows `built-unverified`). Ranking UNCHANGED: DEPLOY #1 (now de-risked by `3dab95d` healthcheck fix, must precede money check), live-money verify #2, secrets rotate #3. NOTE: repo lives at `~/ws/projects-active/home-server/contentor` (the `projects-stopped-progress/Contentor` copy is a dead 2025 fork — ignore it).

Earlier — Last check: **2026-07-04 late (/po next)** — verified: HEAD = `3dab95d`, main == origin/main; prod health ok. 2 commits since earlier 2026-07-04 stamp: healthcheck `start_period`→180s (`3dab95d`) + dev-only demo-media mirror (`7b7b563`). Healthcheck permanent-fix moved Next→DONE; deploy checklist note updated (celery should no longer need manual start). Prod behind ~22 commits.

Earlier — Update: **2026-07-03 (post-push correction)** — the "pricing_type WIP uncommitted / do NOT deploy" warning below is CLEARED: that work was committed and pushed as `d50fdc4` (subscription pricing + rich course-form editing; migrations 0014/0006 now tracked; full suites green: backend 634, e2e 21p+3s). Working tree is clean except this doc. Deploy is unblocked; prod remains at `e24fff4`.

Last check: **2026-07-03 (latest, /po next)** — verified: main == origin/main at `2cc2865`; prod `/api/health/` ok (db+redis ok); prod still at `e24fff4` per ledger (one-step creation NOT deployed → box stays open). WORKING-TREE WARNING STILL STANDS: other agent's pricing_type WIP uncommitted (access.py, courses/downloads models+views+tests, 2 UNTRACKED migrations 0014/0006) — do NOT `deploy.sh contentor` until landed or stashed. Corrections this run: (1) healthcheck claim fixed — django HAS `start_period: 60s`, demo-seed just exceeds it; (2) dunning row missing→partial — `invoice.payment_failed`→past_due webhook mapping, past_due coach badge, and provider portal method all exist; only endpoint+CTA UI missing (Now #4 effort cut to 0.5-1 day). Money-path rows unchanged (built-unverified). Earlier audit stamps below.

Last full audit: **2026-07-03** (post-deploy update: main PUSHED `1eb12a6`; prod DEPLOYED + smoked — pages 200, calendar zoom_class fix live, path-style media 200, tenant mailbox tables present, all containers healthy after manual celery start; deploy gotcha: entrypoint demo-seed exceeds healthcheck window) — earlier checks: git (unpushed count, branch list), prod `/api/health/` (ok), iyzico provider stub, quotas.py 402 status, dunning absence, adminkit plan CRUD, e2e/backend suite states, session ledger, memory (deploy dates, mailbox/domain/announcement pending items, secret rotations). Open `verify` items: monitoring profile on home server. (Tenant-migration entrypoint fix confirmed committed: `973d0cf`, `entrypoint.sh` runs `migrate_schemas --tenant`.)
