# Contentor — Launch Plan (marketing strategy)

> Written 2026-07-05. Companion to `docs/PRODUCT.md` (product gates) — this doc owns the
> go-to-market side: positioning, landing page, content, channels, and the launch sequence.
> Executable "today" work is split out into
> `docs/superpowers/plans/archive/2026-07-05-launch-copy-truth-fixes.md`.

## 0. Hard gates before any traffic

From `docs/PRODUCT.md` — marketing starts only after:

1. **Deploy prod to current main** (prod is ~38 commits behind).
2. **Live-money verify**: one real platform subscription + one real Connect purchase, then refund.
3. **Rotate exposed prod secrets.**
4. **Strip fabricated social proof from the landing page** (see §2 — legal + trust exposure).

Driving traffic to an unverified checkout wastes the only first impressions we get.

## 1. Positioning

**Category copy loses.** "Turn your expertise into a thriving online business" is Kajabi's,
Teachable's, and Podia's headline; they own that SERP and that mindshare.

**The wedge: "Your school, your brand, your money — we're invisible."**

Three real, verifiable differentiators:

1. **True white-label.** Own domain, own colors, students never see Contentor — vs.
   Skool/Circle/Teachable whose brand is everywhere. Paid coaches even get a branded
   email inbox in-app.
2. **Coach is the merchant of record.** Stripe Connect direct charges — money lands in the
   coach's own Stripe account instantly; we never hold it. Payout delays/holds are the #1
   complaint in coach communities about incumbents.
3. **Price anchor.** Live classes + email campaigns + website builder + PWA at $19–49/mo
   vs. Kajabi $149–399/mo.

**Beachhead ICP:** yoga / fitness / dance / wellness instructors who already teach live
(currently: Zoom + Instagram + Linktree + ad-hoc payments). Non-technical, findable in
concentrated communities, live-classes-at-scale matters to them specifically. Everyone may
sign up; the *copy and content* target this person.

**Positioning statement** (build all copy from this):

> Contentor gives coaches their own branded course-and-live-class platform — own domain,
> own app, payments straight to your Stripe — for $19/mo instead of Kajabi's $149.

## 2. Landing page — findings & fixes

Verified against the code on 2026-07-05:

| # | Finding | Where | Fix |
|---|---------|-------|-----|
| P0 | **Fabricated social proof**: "$1M+ earned", "500+ creators", three invented testimonials with placeholder avatars | `frontend-main/messages/{en,tr}/marketing.json` (`stats`, `socialProof.tagline`, `testimonials`, `finalCta.subtitle`) | Remove; replace testimonials with **Founding Creators** offer section |
| P0 | **Pricing FAQ is false**: promises a 14-day trial on every plan (conflicts with free-forever), PayPal (Stripe-only), enterprise invoicing (no such plan) | `messages/{en,tr}/pricing.json` `faq` | Rewrite to the truth |
| P0 | **Numbers contradict the backend.** Backend truth (`backend/apps/core/management/commands/seed_plans.py`): Free = 10 students / 1 GB / no live / can't sell; Starter = $19, 8% fee, 100 students, 100 GB, 100 streaming h, 1 000 emails; Pro = $49, 6% fee, 500 students, 500 GB, 500 streaming h, 5 000 emails. Marketing FAQ claims "50 students and 3 courses" free, "10,000 concurrent students" live, "unlimited students" Pro. Pricing-card bullets are API-driven (auto-correct), but static FAQ/fallback copy is wrong | `messages/{en,tr}/marketing.json`, `messages/{en,tr}/pricing.json` | Align all static copy with seeded values |
| P1 | **Generic hero** with no differentiation and no product visual | `hero-section.tsx` + `marketing.json` `hero` | Rewrite around the wedge (§1) |
| P1 | **Dead demo CTA**: "Watch a 2-min demo" links to `#features`; no video exists — but `/demo` already hosts 7 live, read-only demo tenants (student + coach views) | `hero-section.tsx:68` | Point CTA at `/demo`: "Explore live demos". Massive under-used asset |
| P2 | Unverified claims: CSV student import, migration support, "automatic recording to cloud" | `marketing.json` `faq.migration` | Soften to what exists; founding-creator concierge covers migration honestly |
| P3 | No comparison content (vs Kajabi/Teachable/Skool) | — | New pages, week 2–3 (§5) |

**Open discrepancy for the owner:** decision log says fees Starter 5% / Pro 4%; seeded
values are 8% / 6%; old pricing copy said 5% / 2%. Copy now follows the *seeded* values —
if prod plan records differ (admin-managed pricing exists), reconcile there first. Also:
the free plan renders "0% transaction fee" as an included feature while free coaches can't
sell at all — slightly misleading, worth a component tweak later.

**New hero (EN):**

> **Badge:** Free plan available — no credit card required
> **H1:** Your own course platform. / Your brand. Your money.
> **Sub:** Courses, live classes, and payments under your own name — your students never
> see ours. Launch in minutes; payments go straight to your Stripe account.
> **CTA:** Create your platform free → | **Secondary:** Explore live demos (→ `/demo`)
> **Trust note:** Free forever plan. No credit card. You own your students, your content,
> and your revenue.

## 3. Content to record (in order; each asset serves landing page + YouTube + outreach)

1. **The 3-minute demo** — tour a finished demo tenant as a student, then flip to the coach
   dashboard. Scripted. Embed on the landing page.
2. **The speedrun (5–8 min)** — "I built a complete yoga studio platform — courses, live
   classes, payments — in 10 minutes, unedited," with an on-screen timer. Proves the
   "5 minutes to launch" claim. Product Hunt / Reddit / YouTube workhorse.
3. **The money video (4–6 min)** — "Where your money goes on Kajabi vs. Teachable vs.
   Contentor": walk the Stripe Connect flow, show a purchase landing in the coach's Stripe.
4. **Niche how-to (8–12 min)** — "How to move your yoga classes off Zoom+Venmo and onto
   your own platform, step by step." Evergreen search content for the beachhead ICP.
5. **Short-form cutdowns** — 30–60 s verticals from #2 and #3 (the timer moment; the
   "payment hits your Stripe" moment) for Reels/TikTok/Shorts.

Record #1 and #2 before launch day; #3–5 in weeks 2–3.

## 4. The founding-creator motion (this IS the launch)

We are at phase 1–2 (internal/alpha) of a five-phase launch. A Product Hunt splash now —
zero testimonials, unverified checkout — wastes the one PH shot.

**Weeks 1–3: 10 founding coaches, recruited by hand.**

- **Offer:** "Founding Creator" — 50% off Starter/Pro for 12 months, free concierge setup
  (we build their site *with* them on a call — doubles as the usability lab that closes
  PRODUCT.md's "non-technical dry run" box ten times over), and their school featured on
  the landing page. **In exchange:** a testimonial + permission to showcase their site.
- **Sourcing:** personal network; instructors we already follow; coaches with a visible
  Linktree+Zoom setup on Instagram (self-identified problem). 5–10 personal DMs/emails a
  day. The pitch offers labor, not asks: "I built a platform for coaches like you — I'll
  set yours up for you, free."
- **Success gate:** ≥3 founding coaches with real students and ≥1 real sale. Their stories
  replace the founding-creators placeholder section with real testimonials.

**Weeks 4–6: public launch.**

- Swap landing page to real testimonials + real coach-site screenshots + honest numbers.
- **Product Hunt** (tagline: "Your own branded course platform — students never see us"),
  speedrun video as the hero asset, founding coaches primed to comment.
- Same week: Show HN (speedrun angle), Indie Hackers (solo-founder/home-server build
  story), value-first posts in r/coursecreators, r/yogateachers, r/personaltraining.
- Launch email to the list captured so far.

## 5. Channels (ORB), solo-founder edition

**Owned (start now — compounds):**
- Email capture on the landing page for not-ready visitors ("Get the launch guide: how to
  move your coaching business onto your own platform").
- Comparison/SEO pages: `/vs/kajabi`, `/vs/teachable`, `/vs/skool`, `/kajabi-alternative`.
  "Kajabi alternative" is high-intent volume and our price point is the answer.

**Rented (pick two, ignore the rest):**
- **Instagram/short-form** — where fitness/yoga coaches live. Post cutdowns; goal is DM
  conversations, not followers.
- **YouTube** — videos #2–4. Search traffic ("kajabi alternative", "sell yoga classes
  online") doesn't care about subscriber count.

**Borrowed (highest leverage per hour):**
- Podcast/newsletter guesting in the coach-business niche; pitch "why coaches should own
  their platform," not the product.
- Micro-influencer coaches (5–50k followers): free Pro-for-life + we build their site, in
  exchange for an honest walkthrough to their audience.
- Affiliate/referral for founding coaches (30% recurring, 12 months) — coaches know
  coaches; wire it after the first 10 are live.

## 6. Instrumentation & targets

- Analytics before launch day (Plausible or PostHog, one afternoon). Funnel:
  landing → signup → provisioned site → first course → first sale.
- **30 days:** 10 founding coaches onboarded; 3 with real students; 1 real student
  purchase; **1 paying coach** (the PRODUCT.md north star).
- **60 days:** public launch done (PH + HN + Reddit); 200+ email subscribers; comparison
  pages indexed; 5 paying coaches.
- **90 days:** one coach earning enough that Contentor is obviously worth it — that story
  becomes the homepage.

## 7. Sequenced week-1 checklist

1. Deploy + live-money verify + rotate secrets (PRODUCT.md "Now" list — the gate).
2. Landing/pricing truth fixes → `docs/superpowers/plans/archive/2026-07-05-launch-copy-truth-fixes.md`.
3. Record videos #1 and #2 off the demo tenants.
4. Write the founding-creator outreach list (20 names) and start 5–10 contacts/day.
5. Add email capture + analytics.
