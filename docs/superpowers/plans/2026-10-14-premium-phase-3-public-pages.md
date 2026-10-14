# Premium look — Phase 3: Public pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pricing, blog, login/callback, signup/verify and the coach dashboard wear the Phase 0 visual system (paper, ink, brass, Geist type scale), and the ambient CSS classes the old look needed are deleted with their last user.

**Architecture:** Every page is restyled in place with Phase 0's preset utilities (`text-display` … `text-caption`, `max-w-text`, `max-w-media`, `rounded-tile`, `ease-expo`) and the shadcn tokens; no new primitives except two small pure-logic modules with tests (the pricing feature matrix, the reading-progress math), one `BlogCover` placeholder component, one `ReadingProgress` client component, and an optional determinate `value` on the shared `ProgressLine`. The pricing page becomes an Apple-style compare table with a sticky plan-header row; the blog becomes a cover-led index and a 680 px post; the auth shell becomes a white split page with one Phase 1 photograph; signup only loses its backdrop; the dashboard becomes hairline cards on second paper. Last, `globals.css` and `tailwind.config.ts` drop the aurora/glass/gradient classes, each deletion gated by a grep over `frontend-main/src` (including the superadmin console under `/admin`, which shares the stylesheet) and `packages/shared/src`.

**Tech Stack:** Next.js 14 App Router (server components for pricing/blog/dashboard/auth shell; `"use client"` only for the reading bar), Tailwind 3.4 with the shared preset, next-intl 4 (`messages/en/*.json`), lucide-react, vitest (pure logic only: `frontend-main/vitest.config.ts` includes `src/**/__tests__/**/*.test.ts`), Playwright e2e in `e2e/`.

**Spec:** `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md` — section 5.5 (Other public pages), the "3 Public pages" row of section 6, and the sentence in 5.1 that the ambient classes "are deleted with their last user". Phase 0 plan: `docs/superpowers/plans/2026-10-14-premium-phase-0-foundations.md` ("Contracts for later phases" is binding here).

**Dependencies:** Tasks 1–7 and 9–10 need Phase 0 only (`text-*` preset utilities, `rounded-tile`, the 48 px header). Task 8 (auth) also needs Phase 1's media manifest (`frontend-main/src/lib/media.ts` with the `still-yoga` entry) — the spec's "Phases 3 and 4 need 0 only" is wrong for the login photograph. If Phase 1 has not landed, ship Tasks 1–7, then wait; Task 9's grep gate keeps `.glass-pane`/`.brand-gradient` alive until Task 8 removes their last users.

## Global Constraints

- Marketing pages render light always; there is no `dark:` variant on any page this plan touches (spec D4). The `.dark` class remains for the superadmin console and Phase 2's cinematic chapters only.
- Colour is token-only: `bg-background`, `bg-muted`, `bg-card`, `text-foreground`, `text-muted-foreground`, `text-marketing-accent`, `border`, `bg-destructive`, `bg-chart-2`. No `emerald-*`, `slate-*`, hex or `oklch(...)` literals in page code (spec 5.1, 5.6).
- Token + opacity classes (`bg-primary/20`, `border-border/60`, `text-foreground/80`) emit **no CSS** in this checkout unless `alphaTokens` has landed in `packages/shared/tailwind-preset.ts` (memory `reference-token-opacity-classes-are-no-ops`; `grep -n alphaTokens packages/shared/tailwind-preset.ts` is empty today). Nothing load-bearing in this plan uses them; where an old class did, it is replaced by a plain token class.
- No new runtime dependency (spec D9). `@tailwindcss/typography`, `lucide-react`, `next-intl`, `framer-motion` are already installed.
- Type comes only from the preset utilities `text-display`, `text-display-2`, `text-title`, `text-title-2`, `text-body-lg`, `text-body`, `text-caption` and the CSS class `text-eyebrow` (Phase 0 contract). No `text-5xl`, `text-[28px]`, `font-bold` on headings.
- Layout: text column `max-w-text` (980 px), media column `max-w-media` (1440 px), gutter `px-6`, section padding 72 px phone / 120 px desktop (`py-[72px] md:py-[120px]` or the nearest Tailwind step). Marketing tiles are flat on second paper (`bg-muted`), no shadow, no border; the dashboard (coach-facing admin, spec D1) uses hairline cards `rounded-tile border bg-card`. Marketing buttons are pills: `rounded-full` at the call site (spec 5.1).
- Loading and feedback conventions hold (root `CLAUDE.md`, enforced by `scripts/check-loading-patterns.mjs` in `make lint`): `<NavLink>` for internal links in new markup, `useNavigate()` never `router.push`, `<Spinner>` only, `<Button loading>` for async buttons, a `loading.tsx` at or above every route segment, `motion-safe:` on every transition.
- Every animation honours `prefers-reduced-motion` (spec 5.7). This plan adds exactly one motion: the FAQ chevron rotation, gated by `motion-safe:`.
- `signup-form.tsx` logic is untouched: the only edit is one class string on line 988 (Task 5 proves it with `git diff --stat`).
- e2e selectors on the pages this plan changes keep their role, name and placeholder: see Task 10 Step 2 for the list.
- Never commit a file you did not change; peers share the checkout. Commit only the paths each task lists. One heavy job on the Docker VM at a time: never run `make e2e-spec` while `make test`, `make test-frontend` or a build runs.

## Review Focus

1. A phone (375 px) reader scrolls the pricing compare table: the sticky plan-header row must stay opaque second paper over the rows beneath, the three prices must not wrap or overflow their 100 px columns, and nothing else on the page is sticky. Pinned by Task 2 Step 6 (DevTools rect check at 375 and 1440) and structurally by `text-title-2 md:text-title` + opaque `bg-muted` on the sticky row.
2. A blog post with no cover — today **every** platform post, since `PlatformBlogPost` (`backend/apps/core/models.py:526-550`) has no cover field — must render a tokenised placeholder tile, never a broken image. Pinned by Task 4 Step 6 (browser check on the seeded posts) and by `cover_photo_url` being optional in the type.
3. The login photograph fails to load, or the manifest lacks `still-yoga`: the form must stay centred at 420 px and the photo half must stay second paper with the wordmark; no broken-image glyph. Pinned by `authPhoto()` returning `null` on a missing key or a throwing accessor (Task 8 Step 1) and by Task 8 Step 5 (DevTools request blocking of `/media/stills/*`).
4. The signup flow must behave exactly as before: spec 01 drives it by placeholder and button name. Pinned by Task 5 Step 4 (`git diff --stat` shows `1 +, 1 -` for `signup-form.tsx`) and Task 10 Step 2 (`make e2e-spec SPEC=01-signup-onboarding`).
5. A deleted CSS class is still referenced by the superadmin console under `frontend-main/src/app/admin` or `frontend-main/src/components/admin` (out of scope, but it shares `globals.css`) or by `packages/shared/src` (compiled into this app's CSS). Pinned by Task 9 Step 1: the grep over all three roots must print no user before a rule is deleted; today those roots have zero hits for every class in the list.

---

### Task 1: Pricing feature matrix as pure logic, with a test

**Files:**

- Create: `frontend-main/src/lib/pricing-matrix.ts`
- Test: `frontend-main/src/lib/__tests__/pricing-matrix.test.ts`

**Interfaces:**

- Consumes: nothing new (moves `PLAN_KEYS`, `PlanSummary`, `planKeyFromName`, `dynamicFeatureLabel` out of `frontend-main/src/app/pricing/page.tsx:20-123`).
- Produces: `PLAN_KEYS: readonly ["free","starter","pro"]`, `type PlanKey`, `FEATURE_KEYS: readonly [...]`, `type FeatureKey`, `interface PlanSummary`, `type Cell = { kind: "text"; label: string } | { kind: "yes" } | { kind: "no" }`, `planKeyFromName(name: string): PlanKey | null`, `includedFeatures(base: readonly string[], plan: PlanSummary | null): Set<string>`, `dynamicFeatureLabel(featureKey: string, plan: PlanSummary): string | null`, `featureCell(featureKey: FeatureKey, included: Set<string>, plan: PlanSummary | null, localeLabel: () => string): Cell`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend-main/src/lib/__tests__/pricing-matrix.test.ts
import { describe, expect, it } from "vitest";
import {
  featureCell,
  includedFeatures,
  planKeyFromName,
  type PlanSummary,
} from "@/lib/pricing-matrix";

const plan = (over: Partial<PlanSummary> = {}): PlanSummary => ({
  id: 1,
  name: "starter",
  is_free: false,
  currency: "USD",
  amount_cents: 1990,
  max_students: 100,
  max_storage_gb: 100,
  max_streaming_hours: 10,
  max_campaign_emails: 1000,
  transaction_fee_pct: "8.00",
  is_live_enabled: true,
  ...over,
});

// A locale read that must never happen for this cell.
const boom = () => {
  throw new Error("locale label read");
};

describe("planKeyFromName", () => {
  it("tolerates the seed's casings and rejects unknown plans", () => {
    expect(planKeyFromName("Free")).toBe("free");
    expect(planKeyFromName("starter")).toBe("starter");
    expect(planKeyFromName("PRO")).toBe("pro");
    expect(planKeyFromName("enterprise")).toBeNull();
  });
});

describe("includedFeatures", () => {
  it("keeps the locale list when the plans API is down", () => {
    expect([...includedFeatures(["students", "live"], null)]).toEqual([
      "students",
      "live",
    ]);
  });
  it("follows the live record for live classes and campaigns", () => {
    const set = includedFeatures(
      ["students", "live"],
      plan({ is_live_enabled: false, max_campaign_emails: 500 }),
    );
    expect(set.has("live")).toBe(false);
    expect(set.has("campaigns")).toBe(true);
  });
});

describe("featureCell", () => {
  it("is a dash for a feature the plan lacks, without reading the locale", () => {
    expect(featureCell("campaigns", new Set(["students"]), null, boom)).toEqual(
      { kind: "no" },
    );
  });
  it("is a check for a descriptive feature the plan has", () => {
    expect(featureCell("domain", new Set(["domain"]), null, boom)).toEqual({
      kind: "yes",
    });
    expect(featureCell("live", new Set(["live"]), plan(), boom)).toEqual({
      kind: "yes",
    });
  });
  it("labels quantities from the live record", () => {
    expect(
      featureCell(
        "students",
        new Set(["students"]),
        plan({ max_students: 0 }),
        boom,
      ),
    ).toEqual({ kind: "text", label: "Unlimited students" });
    expect(
      featureCell(
        "fee",
        new Set(["fee"]),
        plan({ transaction_fee_pct: "6.00" }),
        boom,
      ),
    ).toEqual({ kind: "text", label: "6% transaction fee" });
  });
  it("labels a granted campaign quota on a plan whose locale block has no campaigns key", () => {
    // The free plan's locale block lists no `campaigns` feature; if the live
    // record grants one, the label must come from the record, never next-intl.
    const free = plan({
      name: "free",
      is_free: true,
      max_campaign_emails: 200,
    });
    const set = includedFeatures(["students", "storage"], free);
    expect(featureCell("campaigns", set, free, boom)).toEqual({
      kind: "text",
      label: "Email campaigns (200/mo)",
    });
  });
  it("falls back to the locale for a tier the record does not describe", () => {
    expect(
      featureCell(
        "support",
        new Set(["support"]),
        plan(),
        () => "Priority support",
      ),
    ).toEqual({ kind: "text", label: "Priority support" });
    expect(
      featureCell("storage", new Set(["storage"]), null, () => "1 GB storage"),
    ).toEqual({ kind: "text", label: "1 GB storage" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/pricing-matrix.test.ts`
Expected: FAIL, cannot resolve `@/lib/pricing-matrix`.

- [ ] **Step 3: Write the module**

```ts
// frontend-main/src/lib/pricing-matrix.ts
// The compare table's cells (spec 5.5), derived from the locale's per-plan
// lists and the live PlatformPlan records. Pure so vitest can pin it; the
// page only renders what this returns.

export const PLAN_KEYS = ["free", "starter", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/** Row order of the compare table. */
export const FEATURE_KEYS = [
  "students",
  "storage",
  "courseBuilder",
  "live",
  "campaigns",
  "branding",
  "domain",
  "fee",
  "support",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Rows whose cell is a label (a quantity or a tier). The rest are a check
 * or a dash. */
const TEXT_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "students",
  "storage",
  "fee",
  "campaigns",
  "courseBuilder",
  "support",
]);

/** `GET /api/v1/billing/platform/plans/` item. */
export interface PlanSummary {
  id: number;
  name: string;
  is_free: boolean;
  currency: string;
  amount_cents: number | null;
  max_students: number;
  max_storage_gb: number;
  max_streaming_hours: number;
  max_campaign_emails: number;
  transaction_fee_pct: string;
  is_live_enabled: boolean;
}

export type Cell =
  | { kind: "text"; label: string }
  | { kind: "yes" }
  | { kind: "no" };

/** Maps PlatformPlan.name (the seed writes "Free", "starter", "pro") to a
 * column; null for a plan the page has no column for. */
export function planKeyFromName(name: string): PlanKey | null {
  const lower = name.toLowerCase();
  return (PLAN_KEYS as readonly string[]).includes(lower)
    ? (lower as PlanKey)
    : null;
}

/** Features a plan includes: the locale's list, corrected by what the live
 * plan record actually grants (live classes, email campaigns). */
export function includedFeatures(
  base: readonly string[],
  plan: PlanSummary | null,
): Set<string> {
  const set = new Set(base);
  if (plan) {
    if (plan.is_live_enabled) set.add("live");
    else set.delete("live");
    if (plan.max_campaign_emails > 0) set.add("campaigns");
    else set.delete("campaigns");
  }
  return set;
}

/** A limit of 0 means "unlimited" across the platform plan model. */
function limitText(value: number, unit: string, plural: string): string {
  if (value <= 0) return `Unlimited ${plural}`;
  return `${value.toLocaleString()} ${unit}`;
}

/** Quantitative labels come from the live plan record; descriptive ones
 * (course builder, support) return null and fall back to the locale. */
export function dynamicFeatureLabel(
  featureKey: string,
  plan: PlanSummary,
): string | null {
  switch (featureKey) {
    case "students":
      return plan.max_students <= 0
        ? "Unlimited students"
        : `Up to ${plan.max_students.toLocaleString()} students`;
    case "storage":
      return limitText(plan.max_storage_gb, "GB storage", "storage");
    case "fee":
      return `${Number(plan.transaction_fee_pct)}% transaction fee`;
    case "campaigns":
      return plan.max_campaign_emails <= 0
        ? "Email campaigns"
        : `Email campaigns (${plan.max_campaign_emails.toLocaleString()}/mo)`;
    default:
      return null;
  }
}

/** One cell. `localeLabel` is read only when the cell needs a label and the
 * plan record has none, so a feature absent from a plan's locale block (the
 * free plan has no `campaigns` key) is never looked up. */
export function featureCell(
  featureKey: FeatureKey,
  included: Set<string>,
  plan: PlanSummary | null,
  localeLabel: () => string,
): Cell {
  if (!included.has(featureKey)) return { kind: "no" };
  if (!TEXT_FEATURES.has(featureKey)) return { kind: "yes" };
  const dynamic = plan ? dynamicFeatureLabel(featureKey, plan) : null;
  return { kind: "text", label: dynamic ?? localeLabel() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/pricing-matrix.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/lib/pricing-matrix.ts frontend-main/src/lib/__tests__/pricing-matrix.test.ts
git commit -m "feat(pricing): feature-matrix derivation as pure logic, with a test"
```

---

### Task 2: Pricing page as an Apple-style compare layout

**Files:**

- Modify: `frontend-main/src/app/pricing/page.tsx` (whole file, 380 lines; `PricingCta.tsx` and `@shared/lib/format-plan-price` stay unchanged)
- Modify: `frontend-main/messages/en/pricing.json:85` (insert new keys before `"faq"`)
- Modify: `frontend-main/src/app/pricing/loading.tsx` (whole file, 19 lines)
- Delete: `frontend-main/src/components/landing/parallax.tsx` (its only importer is `pricing/page.tsx:13,170,353`; verified by `grep -rn "landing/parallax\|<Parallax" frontend-main/src`)

**Interfaces:**

- Consumes: Task 1's `pricing-matrix.ts`; preset utilities `text-display`, `text-title`, `text-title-2`, `text-body-lg`, `text-body`, `text-caption`, `max-w-text`, `ease-expo`; the Phase 0 header is `h-12`, so the sticky row is `top-12`.
- Produces: new locale keys `pricing.features.{students,storage,courseBuilder,live,campaigns,branding,domain,fee,support}` and `pricing.compare.{included,notIncluded}`.

- [ ] **Step 1: Add the locale keys**

In `frontend-main/messages/en/pricing.json`, insert after the closing `}` of `"plans"` (line 84) and before `"faq": {` (line 85):

```json
  "features": {
    "students": "Students",
    "storage": "Storage",
    "courseBuilder": "Course builder",
    "live": "Live classes",
    "campaigns": "Email campaigns",
    "branding": "Custom branding",
    "domain": "Custom domain",
    "fee": "Transaction fee",
    "support": "Support"
  },
  "compare": {
    "included": "Included",
    "notIncluded": "Not included"
  },
```

Every existing key stays (spec 01 and `PricingCta` read `pricing.cta`, `pricing.ctaProcessing`, `pricing.errors.*`, `pricing.plans.*`).

- [ ] **Step 2: Replace `page.tsx`**

Replace the whole of `frontend-main/src/app/pricing/page.tsx` with:

```tsx
import { headers } from "next/headers";
import Link from "next/link";
import { Check, ChevronDown, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { formatPlanPrice } from "@shared/lib/format-plan-price";
import { getAuthUser } from "@/lib/auth";
import { BASE_DOMAIN, DJANGO_API_URL } from "@/lib/constants";
import {
  FEATURE_KEYS,
  PLAN_KEYS,
  featureCell,
  includedFeatures,
  planKeyFromName,
  type Cell,
  type PlanKey,
  type PlanSummary,
} from "@/lib/pricing-matrix";

import { PricingCta } from "./PricingCta";

const FAQ_KEYS = ["switch", "trial", "payments", "limits"] as const;
const HIGHLIGHTED: PlanKey = "starter";
/** The compare grid: a label column on md+, then one column per plan. On a
 * phone the label spans the row above the three cells. */
const COLUMNS =
  "grid grid-cols-3 gap-3 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-6";

interface PlansResponse {
  region: string;
  currency: string;
  plans: PlanSummary[];
}

async function fetchPlans(): Promise<PlansResponse | null> {
  const country = headers().get("cf-ipcountry");
  try {
    const res = await fetch(
      `${DJANGO_API_URL}/api/v1/billing/platform/plans/`,
      {
        headers: {
          "X-Tenant-Domain": BASE_DOMAIN,
          // Server-side fetch loses the visitor: forward Cloudflare's country
          // so the API picks EUR vs USD for them.
          ...(country ? { "CF-IPCountry": country } : {}),
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function CellView({
  cell,
  included,
  notIncluded,
}: {
  cell: Cell;
  included: string;
  notIncluded: string;
}) {
  if (cell.kind === "text") {
    return <span className="text-caption text-foreground">{cell.label}</span>;
  }
  if (cell.kind === "yes") {
    return (
      <>
        <Check
          aria-hidden
          className="size-4 text-foreground"
          strokeWidth={2.5}
        />
        <span className="sr-only">{included}</span>
      </>
    );
  }
  return (
    <>
      <Minus aria-hidden className="size-4 text-muted-foreground" />
      <span className="sr-only">{notIncluded}</span>
    </>
  );
}

// TODO(phase-2): under each pricing CTA, surface a "Already have an account?
// Manage your plan in your dashboard." link routing to
// `https://{slug}.contentor.app/admin/billing` when a `tenant_slug` cookie is
// present on the marketing apex. The marketing host can't read tenant-subdomain
// cookies, so this requires a dedicated cookie set at login time. Left out of
// Phase 1.5 to keep scope tight — `ChangePlanCard` on the tenant subdomain
// covers the existing-coach upgrade path for now.
export default async function PricingPage() {
  const user = await getAuthUser();
  const t = await getTranslations("pricing");
  const plansData = await fetchPlans();
  const planByKey: Partial<Record<PlanKey, PlanSummary>> = {};
  for (const p of plansData?.plans ?? []) {
    const key = planKeyFromName(p.name);
    if (key != null) planByKey[key] = p;
  }
  const included = Object.fromEntries(
    PLAN_KEYS.map((key) => [
      key,
      includedFeatures(
        (t.raw(`plans.${key}.included`) as string[]) ?? [],
        planByKey[key] ?? null,
      ),
    ]),
  ) as Record<PlanKey, Set<string>>;
  // Price from the backend when the plan resolved; the locale fallback keeps
  // the page rendering if the API is unavailable.
  const price = (key: PlanKey) => {
    const plan = planByKey[key];
    return plan && !plan.is_free
      ? formatPlanPrice(plan.currency, plan.amount_cents)
      : t(`plans.${key}.price`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      {/* Hero */}
      <section className="px-6 pb-16 pt-24 md:pb-24 md:pt-32">
        <div className="mx-auto max-w-text text-center">
          <p className="text-eyebrow text-muted-foreground">Pricing</p>
          <h1 className="mt-4 text-display text-balance text-foreground">
            {t("title")}
          </h1>
          <p className="mx-auto mt-5 max-w-[640px] text-body-lg text-balance text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </section>

      {/* Compare */}
      <section className="bg-muted">
        <div className="mx-auto max-w-text px-6 pb-20 pt-6 md:pb-28">
          {/* Plan header: the one sticky element on this page, so it sits
              directly under the 48 px header. Opaque second paper hides the
              rows scrolling beneath it. */}
          <div
            className={`sticky top-12 z-30 -mx-6 border-b bg-muted px-6 py-4 ${COLUMNS}`}
          >
            <div className="hidden md:block" aria-hidden />
            {PLAN_KEYS.map((key) => (
              <div key={key} className="min-w-0">
                <p className="truncate text-eyebrow text-muted-foreground">
                  {t(`plans.${key}.name`)}
                  {key === HIGHLIGHTED && (
                    <span className="ml-2 text-marketing-accent">
                      {t("popular")}
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate text-title-2 text-foreground md:text-title">
                  {price(key)}
                </p>
                <p className="text-caption text-muted-foreground">
                  {t(`plans.${key}.period`)}
                </p>
              </div>
            ))}
          </div>

          {/* Description and CTA: scroll away with the page */}
          <div className={`${COLUMNS} mt-6`}>
            <div className="hidden md:block" aria-hidden />
            {PLAN_KEYS.map((key) => (
              <div key={key} className="flex min-w-0 flex-col">
                <p className="hidden flex-1 text-caption text-muted-foreground md:block">
                  {t(`plans.${key}.description`)}
                </p>
                <PricingCta
                  planId={planByKey[key]?.id ?? null}
                  isFreePlan={key === "free"}
                  isAuthenticated={user != null}
                  variant={key === HIGHLIGHTED ? "brand" : "outline"}
                  size="lg"
                  className="w-full rounded-full md:mt-5"
                />
              </div>
            ))}
          </div>

          {/* Feature table */}
          <div className="mt-10 border-t">
            {FEATURE_KEYS.map((feature) => (
              <div
                key={feature}
                className={`${COLUMNS} items-center border-b py-4`}
              >
                <p className="col-span-3 text-caption font-medium text-foreground md:col-span-1">
                  {t(`features.${feature}`)}
                </p>
                {PLAN_KEYS.map((key) => (
                  <div key={key} className="flex min-w-0 items-center">
                    <CellView
                      cell={featureCell(
                        feature,
                        included[key],
                        planByKey[key] ?? null,
                        () => t(`plans.${key}.features.${feature}`),
                      )}
                      included={t("compare.included")}
                      notIncluded={t("compare.notIncluded")}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[760px]">
          <div className="text-center">
            <p className="text-eyebrow text-muted-foreground">Questions</p>
            <h2 className="mt-4 text-title text-foreground">
              {t("faq.title")}
            </h2>
          </div>
          <div className="mt-12 border-t">
            {FAQ_KEYS.map((key) => (
              <details key={key} className="group border-b py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-body font-medium text-foreground [&::-webkit-details-marker]:hidden">
                  {t(`faq.items.${key}.q`)}
                  <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-expo"
                  />
                </summary>
                <p className="mt-3 max-w-[640px] text-body text-muted-foreground">
                  {t(`faq.items.${key}.a`)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-muted px-6 py-20 md:py-28">
        <div className="mx-auto max-w-text text-center">
          <h2 className="text-title text-foreground">{t("cta2.title")}</h2>
          <p className="mx-auto mt-4 max-w-[560px] text-body text-muted-foreground">
            {t("cta2.subtitle")}
          </p>
          <Button
            asChild
            variant="brand"
            size="xl"
            className="mt-8 rounded-full"
          >
            <Link href="/signup">{t("cta2.button")}</Link>
          </Button>
          <p className="mt-4 text-caption text-muted-foreground">
            {t("cta2.trustNote")}
          </p>
        </div>
      </section>

      <PlatformFooter />
    </div>
  );
}
```

What is gone on purpose: the `Parallax` + `aurora` layers, every `ScrollReveal`, `glass-pane`/`glass-strong`/`shadow-glow-blue`, the oklch gradient halo, `reveal-fade-up`, `hero-scroll-out`, and the unused `Badge`/`Card`/`Separator` imports. Apple's compare page is static; the chevron is the one motion.

- [ ] **Step 3: Delete `Parallax`**

```bash
git rm frontend-main/src/components/landing/parallax.tsx
grep -rn "parallax\|Parallax" frontend-main/src
```

Expected: the grep prints nothing (spec 9 lists parallax under "Not doing").

- [ ] **Step 4: Match the loading skeleton to the new layout**

Replace `frontend-main/src/app/pricing/loading.tsx` with:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeletons";

export default function PricingLoading() {
  return (
    <>
      <div className="sticky top-0 z-50">
        <Skeleton className="h-12 w-full rounded-none" />
      </div>
      <div className="mx-auto max-w-text space-y-10 px-6 py-24">
        <SkeletonPageHeader className="mx-auto w-fit" />
        <SkeletonTable rows={9} cols={4} />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean. (`t(`features.${feature}`)` and `t(`plans.${key}.features.${feature}`)` are untyped string keys, as the old page's were.)

- [ ] **Step 6: Browser check (Review Focus 1)**

Open `http://localhost/pricing` in the browser pane.

1. At 1440 wide: white hero, `display` title, the compare block on second paper with three columns, the header row (names, prices in `title`, periods) sticks under the 48 px header as the table scrolls; ink checks and muted dashes; the FAQ opens with the chevron turning; the final CTA is an ink pill.
2. Resize to 375 (`resize_window` preset `mobile`), reload, scroll to the middle of the feature table and run in the console:

```js
const sticky = document.querySelector(".sticky.top-12");
const row = [...document.querySelectorAll(".border-b.py-4")].find(
  (r) =>
    r.getBoundingClientRect().top > sticky.getBoundingClientRect().bottom - 1,
);
({
  stickyTop: sticky.getBoundingClientRect().top,
  opaque: getComputedStyle(sticky).backgroundColor !== "rgba(0, 0, 0, 0)",
  firstVisibleRowTop: row?.getBoundingClientRect().top,
  priceOverflow: [...sticky.querySelectorAll(".text-title-2")].some(
    (p) => p.scrollWidth > p.clientWidth,
  ),
});
```

Expected: `stickyTop` is 48, `opaque` is `true`, `firstVisibleRowTop` ≥ the sticky row's bottom, `priceOverflow` is `false`. 3. DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: the FAQ still opens, the chevron flips without a transition. 4. No need to stop Django to see the API-down rendering: the locale fallback path (`plan === null`, prices and labels from `pricing.json`) is pinned by Task 1's tests.

- [ ] **Step 7: Commit**

```bash
git add frontend-main/src/app/pricing/page.tsx frontend-main/src/app/pricing/loading.tsx frontend-main/messages/en/pricing.json
git commit -m "feat(pricing): Apple-style compare layout with a sticky plan header; Parallax deleted"
```

---

### Task 3: Reading progress — pure math, a determinate `ProgressLine`, and the bar

**Files:**

- Create: `frontend-main/src/lib/reading-progress.ts`
- Test: `frontend-main/src/lib/__tests__/reading-progress.test.ts`
- Modify: `packages/shared/src/ui/progress-line.tsx` (whole file, 17 lines; its two callers `navigation-progress.tsx:36` and `stale-container.tsx:22` pass no props and keep working)
- Create: `frontend-main/src/components/blog/reading-progress.tsx`

**Interfaces:**

- Produces: `readingProgress(top: number, height: number, viewportHeight: number, offset = 0): number` (0–1); `<ProgressLine className? value? label? />` where `value` (0–1) switches the bar to determinate and `label` defaults to `"Loading"`; `<ReadingProgress targetId="post-body" />`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend-main/src/lib/__tests__/reading-progress.test.ts
import { describe, expect, it } from "vitest";
import { readingProgress } from "@/lib/reading-progress";

// top = article's bounding-rect top; the bar starts when the article's top
// reaches `offset` (the 48 px header) and ends when its bottom reaches the
// bottom of the viewport.
describe("readingProgress", () => {
  const vh = 800;
  const header = 48;
  it("is 0 before the article reaches the header", () => {
    expect(readingProgress(600, 3000, vh, header)).toBe(0);
    expect(readingProgress(48, 3000, vh, header)).toBe(0);
  });
  it("is 1 when the article's bottom reaches the viewport bottom, and stays 1 past it", () => {
    // travel = 3000 - (800 - 48) = 2248 → top at 48 - 2248
    expect(readingProgress(48 - 2248, 3000, vh, header)).toBe(1);
    expect(readingProgress(-5000, 3000, vh, header)).toBe(1);
  });
  it("is linear in between", () => {
    expect(readingProgress(48 - 1124, 3000, vh, header)).toBeCloseTo(0.5);
  });
  it("jumps 0 → 1 for an article shorter than the viewport", () => {
    expect(readingProgress(200, 400, vh, header)).toBe(0);
    expect(readingProgress(40, 400, vh, header)).toBe(1);
  });
  it("is 0 for a missing or zero-height article and non-finite input", () => {
    expect(readingProgress(0, 0, vh)).toBe(0);
    expect(readingProgress(Number.NaN, 3000, vh)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/reading-progress.test.ts`
Expected: FAIL, cannot resolve `@/lib/reading-progress`.

- [ ] **Step 3: Write the math**

```ts
// frontend-main/src/lib/reading-progress.ts
/** Fraction of an article read, from its bounding rect: 0 while its top is
 * below `offset` (the sticky header's height), 1 once its bottom has reached
 * the bottom of the viewport, linear between. An article shorter than the
 * viewport has no travel: it is 0, then 1 as soon as it is under the header. */
export function readingProgress(
  top: number,
  height: number,
  viewportHeight: number,
  offset = 0,
): number {
  if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0)
    return 0;
  const travel = height - (viewportHeight - offset);
  if (travel <= 0) return top <= offset ? 1 : 0;
  return Math.min(1, Math.max(0, (offset - top) / travel));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/reading-progress.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Give `ProgressLine` a determinate mode**

Replace `packages/shared/src/ui/progress-line.tsx` with:

```tsx
import { cn } from "../lib/utils";

/** 2px bar. Shared by NavigationProgress (viewport top) and StaleContainer
 *  (container top edge) so the app has one "work in progress" visual, and by
 *  the blog's reading bar with `value`. Indeterminate by default; under
 *  reduced motion the travel is dropped but the bar stays visible — the state
 *  matters, the movement is decoration. With `value` (0–1) the fill is the
 *  value and nothing moves on its own. */
export function ProgressLine({
  className,
  value,
  label = "Loading",
}: {
  className?: string;
  value?: number;
  label?: string;
}) {
  const determinate = typeof value === "number";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(value * 100) : undefined}
      className={cn("h-0.5 w-full overflow-hidden bg-primary/20", className)}
    >
      {determinate ? (
        <div
          className="h-full w-full origin-left bg-primary"
          style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})` }}
        />
      ) : (
        <div className="bg-primary h-full w-1/3 motion-safe:animate-progress-indeterminate motion-reduce:w-full" />
      )}
    </div>
  );
}
```

(`bg-primary/20` is kept as it was: it is a no-op without `alphaTokens` and harmless with it.)

- [ ] **Step 6: Write the reading bar**

```tsx
// frontend-main/src/components/blog/reading-progress.tsx
"use client";

import { useEffect, useState } from "react";
import { ProgressLine } from "@/components/ui/progress-line";
import { readingProgress } from "@/lib/reading-progress";

/** Height of the sticky marketing header (Phase 0: h-12). */
const HEADER_PX = 48;

/** A 2 px ink line under the header that fills as the element `targetId`
 * scrolls past (spec 5.5). Measured on scroll and resize in one rAF; no
 * layout cost (transform only). Labelled so it never reads as "Loading". */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      setValue(readingProgress(r.top, r.height, window.innerHeight, HEADER_PX));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [targetId]);

  return (
    <ProgressLine
      value={value}
      label="Reading progress"
      className="fixed inset-x-0 top-12 z-40 bg-transparent"
    />
  );
}
```

- [ ] **Step 7: Typecheck both apps (shared primitive changed)**

Run: `make typecheck`
Expected: clean for `nextjs-main` and `nextjs-customer`. `ReadingProgress` has no caller yet (Task 4 mounts it).

- [ ] **Step 8: Commit**

```bash
git add frontend-main/src/lib/reading-progress.ts frontend-main/src/lib/__tests__/reading-progress.test.ts packages/shared/src/ui/progress-line.tsx frontend-main/src/components/blog/reading-progress.tsx
git commit -m "feat(blog): reading-progress math with a test; ProgressLine gains a determinate value"
```

---

### Task 4: Blog index and post

**Files:**

- Modify: `frontend-main/src/lib/platform-blog.ts:5-13` (type)
- Create: `frontend-main/src/components/blog/blog-cover.tsx`
- Modify: `frontend-main/src/app/blog/page.tsx` (whole file, 52 lines)
- Modify: `frontend-main/src/app/blog/[slug]/page.tsx` (whole file, 79 lines)
- Modify: `frontend-main/src/app/blog/loading.tsx` (whole file, 10 lines)
- Modify: `frontend-main/src/app/blog/[slug]/loading.tsx` (whole file, 19 lines)
- Modify: `frontend-main/src/styles/globals.css` (append one `.prose-tokens` rule after the "Typography helpers" block)

**Interfaces:**

- Consumes: Task 3's `<ReadingProgress targetId />`; `NavLink` from `@/components/ui/nav-link` (props `href`, `className`, `children`); preset utilities.
- Produces: `PlatformBlogPost.cover_photo_url?: string | null`; `<BlogCover post priority? className? />` where `post` is `Pick<PlatformBlogPost, "title" | "tags" | "cover_photo_url">`.

Fact to hold in mind: the platform blog API (`backend/apps/blog/serializers.py:154-174`, `PlatformBlogPostSerializer`) returns `id, slug, title, excerpt, meta_description, tags, body_html, status, source, published_at` — **no cover**. Only the tenant `BlogPost` has `cover_photo`. So the cover field is typed optional and the placeholder is what every post renders today; a real cover is a backend follow-up outside this phase.

- [ ] **Step 1: Type the optional cover**

In `frontend-main/src/lib/platform-blog.ts` replace lines 5–13 with:

```ts
export interface PlatformBlogPost {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  meta_description?: string;
  body_html?: string;
  published_at: string;
  /** Not sent by the platform blog API today (PlatformBlogPost has no cover
   * field); read when it appears so covers light up without a frontend change. */
  cover_photo_url?: string | null;
}
```

- [ ] **Step 2: Write the cover component**

```tsx
// frontend-main/src/components/blog/blog-cover.tsx
import type { PlatformBlogPost } from "@/lib/platform-blog";
import { cn } from "@/lib/utils";

interface BlogCoverProps {
  post: Pick<PlatformBlogPost, "title" | "tags" | "cover_photo_url">;
  /** The index hero and the post cover load eagerly; grid tiles lazily. */
  priority?: boolean;
  className?: string;
}

/** 16:9 cover tile (spec 5.5). With a cover URL it is the picture; without
 * one — every platform post today — a tokenised tile: second paper, the
 * title's initial in hairline ink, the first tag as an eyebrow. Never a
 * broken image: the <img> is only rendered when there is a URL, and its
 * alt is empty, so a failed load paints nothing over the paper. */
export function BlogCover({
  post,
  priority = false,
  className,
}: BlogCoverProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-tile bg-muted",
        className,
      )}
      style={{ aspectRatio: "16 / 9" }}
    >
      {post.cover_photo_url ? (
        <img
          src={post.cover_photo_url}
          alt=""
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 p-6 md:p-8">
          <span className="select-none text-display text-border">
            {post.title.trim().charAt(0).toUpperCase() || "C"}
          </span>
          <span className="absolute bottom-6 left-6 text-eyebrow text-muted-foreground md:bottom-8 md:left-8">
            {post.tags[0] ?? "Blog"}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace the index**

Replace `frontend-main/src/app/blog/page.tsx` with:

```tsx
import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { NavLink } from "@/components/ui/nav-link";
import { BlogCover } from "@/components/blog/blog-cover";
import { getAuthUser } from "@/lib/auth";
import { fetchPlatformPosts } from "@/lib/platform-blog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog — Contentor",
  description:
    "Guides and ideas for coaches and creators building an online business with Contentor.",
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

export default async function PlatformBlogIndexPage() {
  const [user, posts] = await Promise.all([
    getAuthUser(),
    fetchPlatformPosts(),
  ]);
  // The API orders by -published_at: the first post is the newest.
  const [latest, ...rest] = posts;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <main className="flex-1 pb-20 pt-10 md:pt-14">
        <h1 className="mx-auto max-w-media px-6 text-eyebrow text-muted-foreground">
          Blog
        </h1>

        {!latest && (
          <p className="mx-auto max-w-text px-6 pt-16 text-body text-muted-foreground">
            No posts yet.
          </p>
        )}

        {latest && (
          <NavLink
            href={`/blog/${latest.slug}`}
            className="group mx-auto mt-6 block max-w-media px-6"
          >
            <BlogCover post={latest} priority />
            <div className="mx-auto mt-8 max-w-text text-center md:mt-10">
              <time
                className="text-caption text-muted-foreground"
                dateTime={latest.published_at}
              >
                {formatDate(latest.published_at)}
              </time>
              <h2 className="mt-3 text-display-2 text-balance text-foreground decoration-1 underline-offset-8 group-hover:underline">
                {latest.title}
              </h2>
              <p className="mx-auto mt-4 max-w-[640px] text-body-lg text-balance text-muted-foreground">
                {latest.excerpt}
              </p>
            </div>
          </NavLink>
        )}

        {rest.length > 0 && (
          <ul className="mx-auto mt-20 grid max-w-media gap-x-6 gap-y-14 px-6 md:mt-28 md:grid-cols-3">
            {rest.map((post) => (
              <li key={post.slug}>
                <NavLink href={`/blog/${post.slug}`} className="group block">
                  <BlogCover post={post} />
                  <time
                    className="mt-5 block text-caption text-muted-foreground"
                    dateTime={post.published_at}
                  >
                    {formatDate(post.published_at)}
                  </time>
                  <h3 className="mt-2 text-title-2 text-balance text-foreground decoration-1 underline-offset-4 group-hover:underline">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-body text-muted-foreground">
                    {post.excerpt}
                  </p>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PlatformFooter />
    </div>
  );
}
```

- [ ] **Step 4: Replace the post page and add the prose token rule**

Replace `frontend-main/src/app/blog/[slug]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";

import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { BlogCover } from "@/components/blog/blog-cover";
import { ReadingProgress } from "@/components/blog/reading-progress";
import { getAuthUser } from "@/lib/auth";
import { fetchPlatformPost } from "@/lib/platform-blog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await fetchPlatformPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Contentor`,
    description: post.meta_description || post.excerpt,
    openGraph: {
      title: post.title,
      description: post.meta_description || post.excerpt,
      type: "article",
      ...(post.cover_photo_url ? { images: [post.cover_photo_url] } : {}),
    },
  };
}

export default async function PlatformBlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [user, post] = await Promise.all([
    getAuthUser(),
    fetchPlatformPost(slug),
  ]);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    datePublished: post.published_at,
    author: { "@type": "Organization", name: "Contentor" },
    ...(post.cover_photo_url ? { image: post.cover_photo_url } : {}),
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <ReadingProgress targetId="post-body" />
      <main className="flex-1 pb-20 pt-10 md:pt-14">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <article>
          <header className="mx-auto max-w-text px-6 text-center">
            <time
              className="text-caption text-muted-foreground"
              dateTime={post.published_at}
            >
              {new Date(post.published_at).toLocaleDateString()}
            </time>
            <h1 className="mt-3 text-display-2 text-balance text-foreground">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mx-auto mt-4 max-w-[640px] text-body-lg text-balance text-muted-foreground">
                {post.excerpt}
              </p>
            )}
          </header>
          <div className="mx-auto mt-10 max-w-text px-6 md:mt-14">
            <BlogCover post={post} priority />
          </div>
          {/* 680 px measure: 680 of text + 24 px gutters (spec 5.5). */}
          <div
            id="post-body"
            className="prose prose-tokens mx-auto mt-12 max-w-[728px] px-6 text-body md:mt-16"
            // Server-sanitized (nh3) before persisting — see
            // apps/blog/ai.py render_body(). Only place body_html is trusted.
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: post.body_html ?? "" }}
          />
        </article>
      </main>
      <PlatformFooter />
    </div>
  );
}
```

In `frontend-main/src/styles/globals.css`, directly after the `.text-eyebrow { ... }` rule (the "Typography helpers" block), add:

```css
/* @tailwindcss/typography on the token sheet: prose-neutral's grey palette is
   raw colour, so the blog post maps every --tw-prose-* variable to a token. */
.prose-tokens {
  --tw-prose-body: var(--foreground);
  --tw-prose-headings: var(--foreground);
  --tw-prose-lead: var(--muted-foreground);
  --tw-prose-links: var(--marketing-accent);
  --tw-prose-bold: var(--foreground);
  --tw-prose-counters: var(--muted-foreground);
  --tw-prose-bullets: var(--border);
  --tw-prose-hr: var(--border);
  --tw-prose-quotes: var(--foreground);
  --tw-prose-quote-borders: var(--border);
  --tw-prose-captions: var(--muted-foreground);
  --tw-prose-code: var(--foreground);
  --tw-prose-pre-code: var(--background);
  --tw-prose-pre-bg: var(--foreground);
  --tw-prose-th-borders: var(--border);
  --tw-prose-td-borders: var(--border);
}
```

(`text-body` on the same element wins over `.prose`'s own `font-size: 1rem`: utilities are emitted after the plugin's components.)

- [ ] **Step 5: Match the two loading skeletons**

Replace `frontend-main/src/app/blog/loading.tsx` with:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCardGrid } from "@/components/ui/skeletons";

export default function BlogLoading() {
  return (
    <div className="mx-auto w-full max-w-media px-6 pb-20 pt-10">
      <Skeleton className="h-4 w-12" />
      <Skeleton className="mt-6 aspect-video w-full rounded-tile" />
      <div className="mx-auto mt-8 max-w-text space-y-3">
        <Skeleton className="mx-auto h-10 w-2/3" />
        <Skeleton className="mx-auto h-4 w-1/2" />
      </div>
      <SkeletonCardGrid className="mt-20" />
    </div>
  );
}
```

Replace `frontend-main/src/app/blog/[slug]/loading.tsx` with:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function BlogPostLoading() {
  return (
    <div className="mx-auto w-full max-w-text px-6 pb-20 pt-10">
      <div className="space-y-3 text-center">
        <Skeleton className="mx-auto h-4 w-24" />
        <Skeleton className="mx-auto h-10 w-3/4" />
        <Skeleton className="mx-auto h-5 w-1/2" />
      </div>
      <Skeleton className="mt-10 aspect-video w-full rounded-tile" />
      <div className="mx-auto mt-12 max-w-[728px] space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck, lint and browser check (Review Focus 2)**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean.

Browser pane, `http://localhost/blog`: the newest post as a 1440 px tile, title in `display-2`, then a three-column grid at 1440 and one column at 375. Every tile is the tokenised placeholder (second paper, hairline initial, tag eyebrow) — the API sends no cover — and the DevTools console shows no failed image request. Open a post: `display-2` title, the cover tile, 680 px body in 17 px; scroll: the 2 px ink line under the header grows from 0 to full exactly as the body's bottom reaches the viewport bottom; the accessibility tree names it "Reading progress". If the dev DB has no platform posts, seed one from `/admin` → Blog (the superadmin generator) or accept "No posts yet." and check the post page with any slug after seeding.

- [ ] **Step 7: Commit**

```bash
git add frontend-main/src/lib/platform-blog.ts frontend-main/src/components/blog/blog-cover.tsx frontend-main/src/app/blog/page.tsx "frontend-main/src/app/blog/[slug]/page.tsx" frontend-main/src/app/blog/loading.tsx "frontend-main/src/app/blog/[slug]/loading.tsx" frontend-main/src/styles/globals.css
git commit -m "feat(blog): cover-led index, 680px post with a reading bar, tokenised placeholder covers"
```

---

### Task 5: Signup and verify keep their stages; the backdrop becomes paper

**Files:**

- Modify: `frontend-main/src/app/signup/signup-shell.tsx:40-43` (backdrop) and `:179` (slide heading)
- Modify: `frontend-main/src/app/signup/verify/page.tsx:25-33` (`StateIcon` styles)
- Modify: `frontend-main/src/app/signup/signup-form.tsx:988` (one class string — the only line)

**Interfaces:**

- Consumes: preset `text-title-2`.
- Produces: nothing new; `SignupShell`, `SignupFrame`, `SlideHeader` keep their props.

- [ ] **Step 1: Remove the aurora backdrop**

In `frontend-main/src/app/signup/signup-shell.tsx` delete lines 40–43:

```tsx
<div aria-hidden className="absolute inset-0 -z-10">
  <div className="aurora animate-aurora" />
  <div className="grid-fade absolute inset-0 opacity-40" />
</div>
```

The wrapper on line 39 (`fixed inset-0 z-50 overflow-hidden bg-background`) is already paper. The progress bars (`bg-foreground/[0.08]` track, `bg-foreground` fill), the slides and `MotionConfig reducedMotion="user"` stay exactly as they are.

- [ ] **Step 2: Put the slide heading on the type scale**

On line 179 change

```tsx
      <h2 className="text-display text-[24px] leading-tight tracking-[-0.02em] md:text-[26px]">
```

to

```tsx
      <h2 className="text-title-2 text-balance text-foreground">
```

(`display` is the hero line; a 24–28 px slide heading is `title-2`. This removes the only `text-display` use that relied on arbitrary-value ordering to shrink it.)

- [ ] **Step 3: Verify's state icon tiles**

In `frontend-main/src/app/signup/verify/page.tsx` replace lines 25–33:

```tsx
  const styles: Record<typeof variant, string> = {
    primary: "text-primary",
    success: "text-chart-2",
    destructive: "text-destructive",
  };
  return (
    <div
      className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted ${styles[variant]}`}
    >
```

(`glass-strong`, `bg-primary/10`, `bg-emerald-500/10` and `text-emerald-500` go; `chart-2` is the token system's green.)

- [ ] **Step 4: The one line in `signup-form.tsx`, proven by diff-stat (Review Focus 4)**

On line 988 change `rounded-2xl glass-strong` to `rounded-2xl bg-muted`:

```tsx
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
```

Run: `git diff --stat -- frontend-main/src/app/signup/signup-form.tsx`
Expected: exactly `1 file changed, 1 insertion(+), 1 deletion(-)`. Then `grep -c "glass\|aurora\|brand-gradient" frontend-main/src/app/signup/signup-form.tsx` prints `0`.

- [ ] **Step 5: Typecheck and look**

Run: `make typecheck`
Expected: clean.

Browser pane, `http://localhost/signup` at 1440 and 375: a white full-screen frame, the three-stage progress row, the brand-name step with its `title-2` heading; type a name and press Continue: the slide still animates; emulate reduced motion and go back: the slide only fades. `http://localhost/signup/verify` without a token shows the error state on a `bg-muted` tile.

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/app/signup/signup-shell.tsx frontend-main/src/app/signup/verify/page.tsx frontend-main/src/app/signup/signup-form.tsx
git commit -m "feat(signup): paper backdrop, slide heading on the type scale, state tiles on second paper"
```

---

### Task 6: Dashboard cards on second paper

**Files:**

- Modify: `frontend-main/src/app/dashboard/page.tsx` (whole file, 194 lines)
- Modify: `frontend-main/src/components/dashboard/publish-controls.tsx:66,70,96,100`
- Modify: `frontend-main/src/app/dashboard/loading.tsx:10-12`
- Unchanged (listed so nobody looks for work here): `platform-card-domain-cta.tsx` (an outline `sm` button, already on tokens), `delete-platform.tsx` (dialog already `rounded-xl border bg-background`; its `bg-black/50` scrim is the house modal scrim and stays), `components/shared/empty-state.tsx` (a shim to `@shared/ui/empty-state`; the dashboard's own `EmptyState` is local to `page.tsx`).

**Interfaces:**

- Consumes: preset `text-title`, `text-title-2`, `text-body`, `text-caption`, `rounded-tile`; `Monogram` from `@/components/shared/logo-mark`.
- Produces: nothing new.

- [ ] **Step 1: Replace `page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Clock, Globe2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { Monogram } from "@/components/shared/logo-mark";
import { getAuthUser } from "@/lib/auth";
import { getMyTenants, type MyTenant } from "@/lib/tenants";
import { PublishControls } from "@/components/dashboard/publish-controls";
import { PlatformCardDomainCta } from "@/components/dashboard/platform-card-domain-cta";
import { DeletePlatform } from "@/components/dashboard/delete-platform";

/** Status as a coloured dot and a word (spec 5.5). Token colours only:
 * chart-2 is the system's green, marketing-accent its brass. */
const STATUS: Record<
  MyTenant["provisioning_status"],
  { label: string; dot: string }
> = {
  ready: { label: "Live", dot: "bg-chart-2" },
  provisioning: { label: "Setting up", dot: "bg-marketing-accent" },
  pending: { label: "Pending", dot: "bg-muted-foreground" },
  failed: { label: "Setup failed", dot: "bg-destructive" },
};

function PlatformCard({ tenant }: { tenant: MyTenant }) {
  const status = STATUS[tenant.provisioning_status];
  const isReady = tenant.provisioning_status === "ready" && tenant.is_active;

  return (
    <div className="flex flex-col rounded-tile border bg-card p-7">
      <div className="flex items-start justify-between gap-3">
        <Monogram
          size={48}
          label={(tenant.name || tenant.slug || "C").charAt(0).toUpperCase()}
        />
        <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
          <span aria-hidden className={`size-2 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      <h3 className="mt-5 text-title-2 text-foreground">{tenant.name}</h3>
      <p className="mt-1 inline-flex items-center gap-1.5 text-caption text-muted-foreground">
        <Globe2 className="size-3.5" />
        {tenant.domain || `${tenant.slug}.contentor.app`}
      </p>

      <div className="mt-5 flex items-center gap-4 text-caption text-muted-foreground">
        <span>
          Plan{" "}
          <span className="font-medium text-foreground">
            {tenant.plan_name ?? "Free"}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {new Date(tenant.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        {isReady ? (
          <Button
            asChild
            variant="brand"
            size="sm"
            className="gap-1.5 rounded-full"
          >
            <a href={tenant.studio_url}>
              Open studio
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="rounded-full" disabled>
            {status.label}
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <a href={tenant.studio_url}>Preview</a>
        </Button>
        <PlatformCardDomainCta slug={tenant.slug} />
        <DeletePlatform
          slug={tenant.slug}
          name={tenant.name}
          blocker={tenant.delete_blocker}
        />
      </div>

      {isReady && (
        <PublishControls
          slug={tenant.slug}
          initialPublished={tenant.is_published}
          initialHasPassword={tenant.has_preview_password}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl rounded-tile border bg-card p-12 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-muted">
        <Sparkles className="size-7 text-foreground" />
      </div>
      <h2 className="mt-6 text-title-2 text-foreground">
        Launch your first platform
      </h2>
      <p className="mx-auto mt-3 max-w-md text-body text-muted-foreground">
        Create a beautifully designed studio for your courses, live classes, and
        email campaigns — all under your own brand.
      </p>
      <Button
        asChild
        variant="brand"
        size="lg"
        className="mt-7 gap-2 rounded-full"
      >
        <Link href="/signup">
          <Plus className="size-4" />
          New platform
        </Link>
      </Button>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  // Superadmins live in /admin — keep this surface coach-only.
  if (user.is_superuser) redirect("/admin");

  const tenants = await getMyTenants();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      <section className="px-6 pb-12 pt-20 md:pt-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-eyebrow text-muted-foreground">
              {user.name ? `Hi, ${user.name.split(" ")[0]}` : "Your studio"}
            </p>
            <h1 className="mt-3 text-title text-foreground">Your platforms</h1>
            <p className="mt-4 max-w-xl text-body text-muted-foreground">
              Manage and open each studio you&apos;ve created with Contentor.
              Launch more whenever inspiration strikes.
            </p>
          </div>

          {tenants.length > 0 && (
            <Button
              asChild
              variant="brand"
              size="lg"
              className="gap-2 rounded-full"
            >
              <Link href="/signup">
                <Plus className="size-4" />
                New platform
              </Link>
            </Button>
          )}
        </div>
      </section>

      <section className="flex-1 bg-muted px-6 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          {tenants.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {tenants.map((tenant) => (
                <PlatformCard key={tenant.id} tenant={tenant} />
              ))}
            </div>
          )}
        </div>
      </section>

      <PlatformFooter />
    </div>
  );
}
```

Gone on purpose: `aurora`/`grid-fade`, `glass-pane`/`glass-strong`, `brand-gradient`, `text-headline`, `text-display text-5xl`, the hover lift, `emerald-*` and every `dark:` variant.

- [ ] **Step 2: Publish controls on tokens**

In `frontend-main/src/components/dashboard/publish-controls.tsx`:

- line 66: `<div className="mt-5 space-y-3 rounded-xl border border-border/60 p-4">` → `<div className="mt-5 space-y-3 rounded-xl border p-4">`
- line 70: `<Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />` → `<Eye className="h-4 w-4 text-chart-2" />`
- line 96: `<div className="space-y-1.5 border-t border-border/60 pt-3">` → `<div className="space-y-1.5 border-t pt-3">`
- line 100: `<span className="text-emerald-600 dark:text-emerald-400">` → `<span className="text-muted-foreground">`

(The icon may be `chart-2`, a 3:1 non-text colour; the word "· set" is real text and stays on `muted-foreground` at 4.5:1.)

- [ ] **Step 3: Loading skeleton header**

In `frontend-main/src/app/dashboard/loading.tsx` replace lines 10–12 with:

```tsx
<div className="sticky top-0 z-50">
  <Skeleton className="h-12 w-full rounded-none" />
</div>
```

- [ ] **Step 4: Typecheck, lint, look**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean.

Browser pane, signed in as a coach (memory `reference-browser-pane-coach-login` has the recipe; or sign up on `http://localhost/signup` with the email sink): `http://localhost/dashboard` shows the title in `title`, cards on second paper with a hairline, monogram, name in `title-2`, domain, a green dot + "Live" for the ready tenant, the same four actions and the publish controls. At 375 the cards stack in one column.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/app/dashboard/page.tsx frontend-main/src/components/dashboard/publish-controls.tsx frontend-main/src/app/dashboard/loading.tsx
git commit -m "feat(dashboard): hairline platform cards on second paper, status as a dot and a word"
```

---

### Task 7: Help bubble surfaces

**Files:**

- Modify: `frontend-main/src/components/shared/help-bubble.tsx:512,518` (two class strings; no logic, no `helpBot` strings)

**Interfaces:** none.

- [ ] **Step 1: Launcher pill and panel on paper**

Line 512 (the launcher `<button>`), replace the `className` with:

```tsx
className =
  "fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border bg-background text-foreground shadow-sm hover:bg-accent motion-safe:transition-colors";
```

Line 518 (the open panel `<div>`), replace the `className` with:

```tsx
        <div className="fixed bottom-6 right-6 z-50 flex h-[min(560px,calc(100dvh-3rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-tile border bg-background shadow-sm">
```

(Ink icon on paper with a hairline instead of an ink disc; `hover:scale-105` and the `shadow-xl/2xl` lift go. Message bubbles, the quick-reply pills and the input keep their classes: they are already token-only.)

- [ ] **Step 2: Diff-stat and look**

Run: `git diff --stat -- frontend-main/src/components/shared/help-bubble.tsx`
Expected: `1 file changed, 2 insertions(+), 2 deletions(-)`.

Browser pane, any page: the launcher is a paper disc with a hairline and an ink icon; open it: the panel has 18 px corners and a hairline.

- [ ] **Step 3: Commit**

```bash
git add frontend-main/src/components/shared/help-bubble.tsx
git commit -m "feat(help): launcher and panel on paper with a hairline"
```

---

### Task 8: Login and callback — white split page with one photograph

**Precondition:** Phase 1 has landed: `frontend-main/src/lib/media.ts` exports `media(key)` and `frontend-main/public/media/media.json` has `still-yoga` (`kind: "still"`, 4:5, `src`, `srcSmall`, `width`, `height`, `alt`). Check with `grep -n '"still-yoga"' frontend-main/public/media/media.json && grep -n "export function media\|export const media" frontend-main/src/lib/media.ts`. If either is missing, stop here, finish Tasks 9–10 only for what Tasks 1–7 changed (Task 9's grep gate keeps `.glass-pane`, `.glass-strong` and `.brand-gradient` while the auth shell still uses them), and return to this task when Phase 1 is in.

**Files:**

- Modify: `frontend-main/src/components/auth/auth-shell.tsx` (whole file, 97 lines)
- Modify: `frontend-main/src/components/auth/magic-link-form.tsx:41,60,74-78`
- Modify: `frontend-main/src/app/(auth)/login/page.tsx:39-43,85-94`
- Modify: `frontend-main/src/app/(auth)/callback/page.tsx:61,74`
- Unchanged: `(auth)/layout.tsx` (redirects a signed-in user to `/admin`), `(auth)/loading.tsx` (`<Spinner size="lg" center />`), `messages/en/auth.json` (every `auth.login.*` and `auth.callback.*` key stays; no new copy appears on the page).

**Interfaces:**

- Consumes: `media("still-yoga")` from `@/lib/media` (Phase 1); `NavLink`; `Wordmark` from `@/components/shared/logo-mark`; preset `text-title-2`, `text-body`.
- Produces: `AuthShell` keeps its props `{ eyebrow?, title, subtitle?, children, footer? }`.

- [ ] **Step 1: Replace `auth-shell.tsx`**

```tsx
import { NavLink } from "@/components/ui/nav-link";
import { Wordmark } from "@/components/shared/logo-mark";
import { media } from "@/lib/media";

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

interface Still {
  src: string;
  srcSmall: string;
  width: number;
  height: number;
}

/** The 4:5 coach photograph beside the form (spec 5.5; Phase 1 manifest). */
const PHOTO_KEY = "still-yoga";

/** Null when the manifest lacks the key or the accessor throws: the photo
 * half then stays second paper with the wordmark and the form does not move. */
function authPhoto(): Still | null {
  try {
    const item = media(PHOTO_KEY) as
      | ({ kind?: string } & Partial<Still>)
      | undefined;
    if (
      !item ||
      item.kind !== "still" ||
      !item.src ||
      !item.width ||
      !item.height
    )
      return null;
    return {
      src: item.src,
      srcSmall: item.srcSmall ?? item.src,
      width: item.width,
      height: item.height,
    };
  } catch {
    return null;
  }
}

/** White auth page (spec 5.5): a 420 px centred form; on desktop one 4:5
 * coach photograph fills the other half with the wordmark over it. The
 * photograph is decoration (alt=""), so a failed load paints nothing over
 * the second paper beneath it. No aurora, no grid, no gradient text. */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  const photo = authPhoto();

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-muted lg:block">
        {photo && (
          <img
            src={photo.src}
            srcSet={`${photo.srcSmall} ${photo.width / 2}w, ${photo.src} ${photo.width}w`}
            sizes="50vw"
            width={photo.width}
            height={photo.height}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <NavLink
          href="/"
          className="absolute left-8 top-8 inline-flex rounded-full bg-background px-3.5 py-1.5"
        >
          <Wordmark className="text-base" />
        </NavLink>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex justify-center lg:hidden">
            <NavLink href="/">
              <Wordmark className="text-base" />
            </NavLink>
          </div>

          <div className="text-center">
            {eyebrow && (
              <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
            )}
            <h1 className="mt-2 text-title-2 text-balance text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-body text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6 text-center">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
```

If Phase 1's `media()` is typed to return a union that already includes `kind: "still"` with these fields, drop the `as` cast and keep the runtime checks; the try/catch stays because the accessor may throw on an unknown key.

- [ ] **Step 2: Magic-link form on paper**

In `frontend-main/src/components/auth/magic-link-form.tsx`:

- line 41: `<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl glass-strong">` → `<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">`
- line 60: `className="text-[13px] font-medium text-foreground/80"` → `className="text-caption font-medium text-foreground"`
- lines 74–78, the submit button: add `rounded-full` so it reads

```tsx
      <Button
        type="submit"
        variant="brand"
        size="lg"
        className="w-full rounded-full"
```

The button text `Send Magic Link`, the `Email` label (`htmlFor="magic-email"`), the placeholder and the "Check your email" heading are unchanged.

- [ ] **Step 3: Login page**

In `frontend-main/src/app/(auth)/login/page.tsx`:

- lines 39–43, the Google button: `className="w-full"` → `className="w-full rounded-full"`.
- lines 85–94, the divider: the form now sits on paper, not a card:

```tsx
<div className="relative py-1">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t" />
  </div>
  <div className="relative flex justify-center">
    <span className="bg-background px-3 text-eyebrow text-muted-foreground">
      {t("or")}
    </span>
  </div>
</div>
```

The Google error box (`border-destructive/20 bg-destructive/10`) is left as it is: without `alphaTokens` those two classes emit nothing today, so the text renders plain red on paper, which is acceptable; with them it becomes a faint tint. Not worth a third variant here.

- [ ] **Step 4: Callback tiles**

In `frontend-main/src/app/(auth)/callback/page.tsx` replace `rounded-2xl glass-strong` with `rounded-2xl bg-muted` on lines 61 and 74:

```tsx
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-destructive">
```

```tsx
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-primary">
```

- [ ] **Step 5: Typecheck and browser check (Review Focus 3)**

Run: `make typecheck && node scripts/check-loading-patterns.mjs`
Expected: clean.

Browser pane, signed out (`fetch("/api/auth/logout", {method:"POST"})` first if needed), `http://localhost/login`:

1. At 1440: left half is the yoga photograph with the wordmark in a paper pill at the top-left; right half a 420 px form: eyebrow, `title-2` title, Google pill, the "or" rule, email field, ink pill. No teal, no gradient, no grid.
2. At 375: the photo half is gone; the wordmark sits above the centred form.
3. DevTools → Network → block request URL pattern `*/media/stills/*`, reload at 1440: the left half is plain second paper with the wordmark, no broken-image glyph; the form has not moved (`document.querySelector('main > div').getBoundingClientRect().width` is 420).
4. `http://localhost/callback` (no token): "Something went wrong" on a `bg-muted` tile; `http://localhost/callback?token=x`: the spinner tile until the API answers.

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/components/auth/auth-shell.tsx frontend-main/src/components/auth/magic-link-form.tsx "frontend-main/src/app/(auth)/login/page.tsx" "frontend-main/src/app/(auth)/callback/page.tsx"
git commit -m "feat(auth): white split page — 420px form, one coach photograph with the wordmark over it"
```

---

### Task 9: Delete the ambient and legacy classes with their last users

**Files:**

- Modify: `frontend-main/src/styles/globals.css` (rules named below; line numbers are those of the file before Phase 0, locate by selector)
- Modify: `frontend-main/tailwind.config.ts:88-96` (`colors.brand`), `:114-121` (`boxShadow`), `:138-142` (`keyframes["aurora-shift"]`), `:148` (`animation.aurora`)
- Modify (only if the files still exist, i.e. Phase 2 has not replaced the landing): `frontend-main/src/components/landing/product-mockup.tsx:69`, `how-it-works-section.tsx:42`, `features-section.tsx:185` (`text-headline` → preset utility)

**Interfaces:** none. After this task `text-headline`, `glass*`, `aurora*`, `grid-fade`, `brand-gradient`, `text-luminous`, `text-gradient`, `editorial-highlight`, `btn-press`, `ring-hairline`, `bg-dot-pattern`, `warm-gradient`, `glow` and the `brand-*` colour utilities no longer exist; nothing in `frontend-main/src` or `packages/shared/src` may reference them.

- [ ] **Step 1: Sweep `text-headline` and run the gate grep (Review Focus 5)**

If `frontend-main/src/components/landing/` still has the three users (`grep -rn text-headline frontend-main/src/components/landing`), change them — these files die in Phase 2, so the edit is mechanical:

- `product-mockup.tsx:69`: `className="text-headline mt-1 text-2xl text-foreground"` → `className="mt-1 text-title-2 text-foreground"`
- `how-it-works-section.tsx:42`: `className="text-headline mt-6 text-xl text-foreground"` → `className="mt-6 text-title-2 text-foreground"`
- `features-section.tsx:185`: `className="text-headline mt-6 text-3xl text-foreground md:text-4xl"` → `className="mt-6 text-title text-foreground"`

Then run the gate from the repo root:

```bash
cd frontend-main && for c in aurora aurora-soft animate-aurora grid-fade bg-dot-pattern warm-gradient glow glass glass-card glass-strong glass-pane ring-hairline brand-gradient text-luminous text-gradient editorial-highlight btn-press text-headline shadow-glass shadow-glass-sm shadow-glow-blue; do printf '%-18s' "$c"; grep -rl --include='*.tsx' --include='*.ts' -E "(^|[^a-zA-Z0-9_-])$c([^a-zA-Z0-9_-]|$)" src ../packages/shared/src | grep -v '^src/styles' | tr '\n' ' '; echo; done; echo "--- brand-* utilities:"; grep -rn --include='*.tsx' --include='*.ts' -E "(bg|text|border|from|to|via|ring|fill|stroke|decoration|outline)-brand-(primary|accent|warm|surface|deep)" src ../packages/shared/src; echo "--- superadmin console + shared:"; grep -rn -E "aurora|grid-fade|glass-|brand-gradient|text-luminous|text-gradient|editorial-highlight|btn-press|warm-gradient|ring-hairline|bg-dot-pattern|text-headline|shadow-glow|shadow-glass" src/app/admin src/components/admin ../packages/shared/src; echo "(end)"
```

Expected after Tasks 2–8:

- every row empty, except `glass` → `../packages/shared/src/ui/badge.tsx ../packages/shared/src/ui/button.tsx` (the cva **variant name** `glass:` in each file, not the CSS class — a false positive of the word-boundary regex; both files were already there before this phase and are not touched);
- if Phase 2 has not landed: `aurora` and `grid-fade` → `src/components/landing/hero-section.tsx` (lines 16–17). Those two rules then stay, see Step 2;
- `brand-*` utilities: nothing; superadmin console + shared: only the two cva variant lines above.

Any other hit is a user you missed: fix it before deleting anything.

- [ ] **Step 2: Delete the CSS rules**

In `frontend-main/src/styles/globals.css` delete these rules (selectors as of the pre-Phase-0 file; the "Typography helpers" and "Surfaces" banners sit around lines 298–355, "Ambient flourish" 356–432, the aurora alias 498–501, `btn-press` 558–561):

- `.text-headline { ... }`
- `.text-gradient { ... }`
- `.brand-gradient, .text-luminous { ... }`
- the whole "Surfaces — legacy glass names" block: `.glass, .glass-card`, `.glass-strong`, `.glass-pane`, `.ring-hairline`, with its comment banner
- `.aurora-soft { ... }`, `.glow { ... }`
- `.bg-dot-pattern { ... }`, `.warm-gradient { ... }`, `.editorial-highlight { ... }`
- the "Legacy alias" comment and `.animate-aurora { animation: none; }`
- `.btn-press:active { ... }`
- `.aurora { ... }` and `.grid-fade { ... }` **only if** Step 1 printed no user for them. If `hero-section.tsx` still uses them, keep those two rules and replace the "Ambient flourish" banner comment with:

```css
/* .aurora and .grid-fade: last user is components/landing/hero-section.tsx;
   Phase 2 deletes them with the old landing. Everything else ambient is gone. */
```

Keep: `.text-eyebrow`, `.prose-tokens` (Task 4), every `@keyframes`, `.reveal-fade-up`, `.animate-float`, `.animate-pulse-soft`, `.animate-marquee`, the scroll-reveal rules, `.nav-link`, `.faq-content`, `.hero-scroll-out`, the reduced-motion block (the landing's; Phase 2 owns them).

- [ ] **Step 3: Trim `tailwind.config.ts`**

In `frontend-main/tailwind.config.ts`:

- delete the `brand: { primary, accent, warm, surface, deep }` entry and its two comment lines from `colors` (lines 88–96);
- delete the whole `boxShadow: { "glass-sm", glass, "glow-blue" }` block (lines 114–121);
- delete `"aurora-shift": { ... }` from `keyframes` (lines 138–142);
- delete `aurora: "aurora-shift 22s ease-in-out infinite",` from `animation` (line 148).

`theme.extend` keeps `colors` (tokens), `borderRadius`, `fontFamily`, `keyframes` (`reveal`, `marquee`, `scale-in`), `animation` (`reveal`, `marquee`, `scale-in`) and `backdropBlur`.

- [ ] **Step 4: Build the CSS once and re-grep the output**

`tailwind.config.ts` is baked into the dev image, not bind-mounted (memory `reference-token-opacity-classes-are-no-ops`), so hot reload will not show config changes. Run:

```bash
docker compose build nextjs-main && docker compose up -d --force-recreate nextjs-main && make health-check
```

Then in the browser pane open `http://localhost/pricing`, `http://localhost/login`, `http://localhost/dashboard`, `http://localhost/signup`, `http://localhost/blog` and, as the superadmin, `http://localhost/admin`: no unstyled element (a tile that lost its background, a heading that lost its weight). In DevTools run on `/admin`:

```js
[...document.querySelectorAll("[class]")]
  .flatMap((e) => [...e.classList])
  .filter((c) =>
    /^(aurora|grid-fade|glass|brand-gradient|text-luminous|text-gradient|editorial-highlight|btn-press|ring-hairline|bg-dot-pattern|warm-gradient|glow|text-headline)/.test(
      c,
    ),
  );
```

Expected: `[]` on every page, including `/admin`.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/styles/globals.css frontend-main/tailwind.config.ts
# plus the three landing files only if Step 1 changed them:
git add frontend-main/src/components/landing/product-mockup.tsx frontend-main/src/components/landing/how-it-works-section.tsx frontend-main/src/components/landing/features-section.tsx
git commit -m "chore(design): delete the aurora, glass and gradient classes with their last users; text-headline swept to the type scale"
```

---

### Task 10: Phase gate

**Files:** none new.

- [ ] **Step 1: Full frontend checks, one after another**

```bash
make typecheck
make lint
make test-frontend
```

Expected: all clean. `make test-frontend` runs both apps' vitest: the new `pricing-matrix.test.ts` (8) and `reading-progress.test.ts` (5) pass with Phase 0's tests. `make lint` includes `scripts/check-loading-patterns.mjs` (every route segment touched here still has its `loading.tsx`: `pricing/`, `blog/`, `blog/[slug]/`, `(auth)/`, `signup/`, `dashboard/`) and the e2e selector self-test.

- [ ] **Step 2: The three e2e specs (Review Focus 4), never in parallel with each other or with Step 1**

```bash
make e2e-spec SPEC=01-signup-onboarding
make e2e-spec SPEC=11-login-code
make e2e-spec SPEC=25-navigation-feedback
```

Expected: PASS each. What they touch on the pages this plan changed:

- `01-signup-onboarding` drives `http://localhost/signup` by `getByPlaceholder(en.signup.brandNamePlaceholder)`, `getByRole("button", { name: en.signup.submit })`, `getByText(en.signup.nameKeep)`, `getByRole("button", { name: en.signup.aboutSkip })`, `getByPlaceholder(en.signup.namePlaceholder)`, `getByPlaceholder(en.signup.emailPlaceholder)`, `getByRole("heading", { name: en.signup.verifyTitle })` — all rendered by `signup-form.tsx` (logic untouched, Task 5) from `auth.json` keys that are unchanged — then follows the emailed `/signup/verify?token=` link (Task 5's `StateIcon` is decoration) into the tenant's `/setup`. Its provisioning timeouts are baseline flake on the dev VM (memory `reference-e2e-502-flakiness`): a `waitForReady` timeout is not evidence of a regression; re-run once, and compare against `main` before debugging.
- `11-login-code` runs on the **tenant** login (`e2e-code.localhost/login`, `frontend-customer`), and `25-navigation-feedback` on the tenant admin: neither renders a `frontend-main` page. They are the impact map's gate for `frontend-main` (`e2e/impact-map.json`: `frontend-main → 01, 10, 11, 18, 22, 24`) and for the shared `ProgressLine` (Task 3; spec 25 asserts `getByRole("progressbar")` appears during a navigation and then has count 0 — the indeterminate branch is byte-for-byte what it was). A blank-page or 502 failure here is the `nextjs-customer` restart after Task 9's rebuild, not code: wait for `make health-check`, re-run once.

- [ ] **Step 3: Review-focus browser pass**

With the browser pane, at 375, 1024 and 1440:

1. `/pricing`: repeat Task 2 Step 6's console check at 375 (sticky row opaque at `top: 48`, no price overflow).
2. `/blog` and one post: placeholder tiles everywhere (no cover in the API), no failed image requests, the reading bar grows to full as the body's bottom meets the viewport bottom.
3. `/login` at 1440 with `*/media/stills/*` blocked: second paper, wordmark, 420 px form unmoved (Task 8 Step 5).
4. `git diff main --stat -- frontend-main/src/app/signup/signup-form.tsx` shows `1 insertion(+), 1 deletion(-)`.
5. As the superadmin, `/admin` in light and dark: unchanged (Task 9 Step 4's class scan returns `[]`).
6. DevTools → Rendering → `prefers-reduced-motion: reduce` on `/pricing` and `/signup`: the FAQ chevron flips without transition; the signup slides only fade.

- [ ] **Step 4: Record the phase**

Append to the spec's status line (`docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md`, line 3): `· Phase 3 done <date>`. Commit it with the next commit that touches the spec or with Phase 5's first commit, not alone.

---

## Self-review

**Spec coverage (5.5 and the row in 6):**

- Pricing — compare layout, three columns on second paper, sticky plan-header row, prices in `title`, feature table with ink checks, FAQ accordion, data and `PricingCta` unchanged, `Parallax` gone: Tasks 1–2.
- Blog — newest post as a 1440 px cover with `display-2` title, three-column grid; post with cover, 680 px measure, `body`, the existing progress line as a reading bar: Tasks 3–4. Gap the spec did not foresee: the platform blog has no cover field, so every cover is the tokenised placeholder until a backend follow-up adds one (reported, not planned here).
- Login, callback — white page, 420 px centred form, 4:5 photograph with the wordmark over it on desktop, no aurora, no grid: Task 8 (needs Phase 1).
- Signup, verify — stages, slides and progress kept, backdrop paper: Task 5.
- Dashboard — cards on second paper, monogram, name in `title-2`, domain, status as dot + word, same actions; thumbnail not done: Task 6.
- 5.1 "deleted with their last user": Task 9, grep-gated, with the `.aurora`/`.grid-fade` exception while the old landing hero exists.
- Shared chrome asked for by the phase brief (help bubble surfaces): Task 7.
- Gate `make e2e-spec` for 01, 11, 25: Task 10.

**Placeholder scan:** no TBD/TODO added by this plan (the pre-existing `TODO(phase-2)` comment in `pricing/page.tsx` is kept verbatim because it documents a product decision, not a gap in this plan); every code step carries its code; every referenced function (`featureCell`, `includedFeatures`, `planKeyFromName`, `readingProgress`, `ReadingProgress`, `BlogCover`, `authPhoto`, `ProgressLine value`) is defined in a task. The one external symbol, `media(key)`, is Phase 1's contract from the Phase 0 plan.

**Type consistency:** `featureCell(featureKey: FeatureKey, included: Set<string>, plan: PlanSummary | null, localeLabel: () => string): Cell` is called exactly so in Task 2; `readingProgress(top, height, viewportHeight, offset)` matches the tests and `ReadingProgress`; `ProgressLine({ className, value, label })` is used with `value`+`label` in Task 3 and prop-less by its two existing callers; `BlogCover` takes `post: Pick<PlatformBlogPost, "title" | "tags" | "cover_photo_url">` and both pages pass a full `PlatformBlogPost`; `PLAN_KEYS`/`FEATURE_KEYS` are `as const` tuples and are iterated with `.map` in Task 2.

**Review Focus → owning task:** 1 → Task 2 Step 6; 2 → Task 4 Step 6 + the optional type; 3 → Task 8 Steps 1 and 5; 4 → Task 5 Step 4 + Task 10 Step 2; 5 → Task 9 Steps 1 and 4.
