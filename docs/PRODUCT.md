# Contentor — Product Plan

> Owned by the `/po` advisor. Humans edit freely; `/po` re-verifies and re-ranks.

## 1. North star & launch-ready checklist

**Pre-launch. North star: shortest path to the FIRST PAYING COACH** (global-first: coach #1 is EN/USD — iyzico/TR explicitly NOT required for launch, per Decision log).

Launch-ready = every box checked:

- [x] Local main pushed to origin (2026-07-03, `1eb12a6`)
- [x] Prod deployed to current main (2026-07-03; all 8 containers healthy — note: entrypoint demo-seed exceeded the healthcheck window, celery needed a manual `up -d` after)
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
| Courses / downloads / media | live-in-prod | path-style presigns smoked in prod 2026-07-03 |
| Live classes (GetStream), zoom classes, onsite events, calendar | live-in-prod | zoom_class fix verified in prod 2026-07-03 |
| Announcements (push/feed/email/templates/recurring) | live-in-prod | deployed 2026-06-23; coach-UI browser smoke still pending |
| Student PWA (installable, offline, web push) | live-in-prod | usage dashboards deployed 2026-07-03 |
| PWA login via emailed 6-digit code ("magic PIN") | live-in-prod | shipped 2026-07-03 (installed apps can't use link cookies); owner phone-test pending |
| Platform billing — subscribe/checkout (Stripe) | built-unverified | e2e-verified in TEST mode locally; never exercised on live keys in prod |
| Platform billing — quota enforcement (402s) | missing | quotas.py log-only; "Phase 3" handler not written |
| Platform billing — dunning/lifecycle UI, receipts, metrics | missing | Phase 2/4 of billing plan |
| Admin-managed plan pricing (superadmin) | live-in-prod | adminkit platform-plans CRUD + provision_stripe_price swap — roadmap §15 is stale here |
| Marketplace — Stripe Connect direct charges (coach = MoR) | built-unverified | e2e-verified TEST mode; prod live-mode unverified; "don't blind-deploy" note stands |
| Marketplace — iyzico (TR) | missing | declared provider choice only; NOT needed for coach #1 (global-first) |
| Coach earnings / payouts view | partial | earnings endpoint + Connect dashboard link; no in-app payout history |
| Website builder (6 pages, blocks, autosave) | live-in-prod | deployed 2026-07-03; coach walkthrough pending |
| Filters / tags | live-in-prod | deployed 2026-07-03 |
| Coach mailbox (inbox, compose, inbound via CF Email Worker) | partial (send-only live 2026-07-03) | prod needs MAILBOX_INBOUND_SECRET + Email Worker deploy; inbound requires custom domain |
| Custom-domain onboarder (Route53 + annual sub) | partial | Phase 1 backend only, behind bypass fakes; phases 2-4 + prod creds outstanding |
| Impersonation (superadmin→coach, coach→student) | live-in-prod | coach→student e2e-covered |
| Superadmin panel (revenue, webhook log, adminkit) | live-in-prod | |
| Local dev/e2e infra (MinIO, fakes, sink, Playwright suite) | done (dev-only) | make e2e 17p+3s; stripe specs 2p; backend 603/603 |
| Monitoring (prometheus/grafana compose profile) | verify | is the profile actually running on the home server? |

## 3. Backlog

### Now (ranked — the money path is the launch gate)

1. **Verify the money path on live Stripe** — one real platform subscription + one real Connect purchase (then refund both). Converts the two `built-unverified` rows to `live-in-prod`; THE gate to inviting a real coach. Needs the owner's card. *(effort: half a day incl. webhook config)*
2. **Rotate exposed prod secrets** — `.env.prod` values were exposed in a past session; new keys from each provider dashboard (owner), then redeploy env. *(effort: 1-2 hours)*
3. **Interactive prod walkthrough** — signup with a real inbox → provision → build a page → create a course, as a coach would. Completes the smoke checklist box. *(effort: 1 hour)*
4. **MVP failed-payment handling** — past-due grace surfaced to the coach + a Stripe customer-portal link; NOT the full dunning suite. *(effort: 1-2 days)*

### Next

- Quota enforcement 402s (Phase 3) — needed before coaches can hit plan limits meaningfully; pair with plan-limit copy in the coach UI.
- Non-technical onboarding dry run + fixes (the `/courses`-empty-catalog class of bug is what a real coach hits) — recruit one non-technical tester.
- Announcements coach-UI browser smoke (10 minutes, has been pending since June).
- Coach payout history in-app (beyond the Connect dashboard link).
- Mailbox inbound in prod (Email Worker + secret) — depends on custom-domain phases for real value; send-only is fine for launch.
- Monitoring check: confirm prometheus/grafana actually run on the home server; add a basic uptime alert.

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

## 5. Audit stamp

Last full audit: **2026-07-03** (post-deploy update: main PUSHED `1eb12a6`; prod DEPLOYED + smoked — pages 200, calendar zoom_class fix live, path-style media 200, tenant mailbox tables present, all containers healthy after manual celery start; deploy gotcha: entrypoint demo-seed exceeds healthcheck window) — earlier checks: git (unpushed count, branch list), prod `/api/health/` (ok), iyzico provider stub, quotas.py 402 status, dunning absence, adminkit plan CRUD, e2e/backend suite states, session ledger, memory (deploy dates, mailbox/domain/announcement pending items, secret rotations). Open `verify` items: monitoring profile on home server. (Tenant-migration entrypoint fix confirmed committed: `973d0cf`, `entrypoint.sh` runs `migrate_schemas --tenant`.)
