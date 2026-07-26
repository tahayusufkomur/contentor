# Content-First Wizard (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the content-first wizard flow (Business → Content → Logo → Launch) as a variant selected by the holdout bucket, so `treatment` coaches create a real course/event/blog during signup while `control` coaches keep today's design-questionnaire wizard.

**Architecture:** The wizard is driven by a pure step machine (`frontend-main/src/lib/wizard/machine.ts`) rendered by `WizardFlow.tsx`. This plan adds a second step builder, `buildContentSteps`, selected by `wizard_bucket` from the wizard-state response (Plan 3e). Both flows coexist during the holdout — nothing is deleted (that is a post-experiment cleanup). New content steps provision the schema on entry (Plan 3a's `wizard/provision/`) and POST to the content endpoints (Plan 3c). The classic flow is untouched.

**Tech Stack:** Next.js 14, React, TypeScript, next-intl, Vitest (machine), Playwright (flow).

## Why this plan exists

Plan 3a made the tenant schema provisionable early; Plan 3c gave the wizard endpoints to write a real course/event/blog; Plan 3e assigns each signup a `control`/`treatment` bucket and exposes it in the wizard-state response. This plan is the frontend that ties them together — the actual content-first experience — shipped behind the bucket so it can be measured against the current wizard before replacing it.

**Verified frontend facts** (file:line):
- `buildSteps(catalog, answers)` → `StepDef[]` and `answered(step, answers)` in `machine.ts:31-112`; `CHAPTERS = ["business","look","pages","logo","launch"]` (machine.ts:6-12).
- `WizardFlow.tsx` renders the current step via a `switch (step.id)` (WizardFlow.tsx:296-420) and commits answers with `patchWizardState`/`finalizeWizard` (`lib/wizard/api.ts`).
- Wizard-state response already carries `state` (answers); Plan 3e adds `wizard_bucket` to it (`_state_body`).
- API client pattern: token-in-body `request<T>()` in `lib/wizard/api.ts:12`.

## Global Constraints

- **The classic flow is never modified.** `buildSteps`, the `look.*`/`pages.*` step components, and their rendering must keep working byte-for-byte for `control`. Add alongside; do not edit control paths.
- **Variant is chosen once, from `wizard_bucket`.** `treatment` → content flow; anything else (`control`, empty) → classic. An empty bucket (pre-3e tenants) must render the classic flow — never crash on a missing bucket.
- **Content steps are skippable.** "I'll do this later" advances without creating a row; the publish gate (Plan 1) and the admin checklist pick up the gap.
- **Provisioning gates the content chapter, not the wizard.** On entering the first content step, call `wizard/provision/` and poll `status` until `provisioned`; show a brief "setting up your studio" state. Steps before content (niche/describe/goals) never wait on provisioning.
- **Follow loading/nav conventions** (root CLAUDE.md): `<Spinner>`, no raw `animate-spin`; async submit buttons use the loading prop.
- Verify: `make test-frontend` (Vitest, host: `cd frontend-main && npx vitest run` — note **frontend-main**, not customer), `make typecheck`, `make e2e-spec SPEC=01-signup-onboarding`.

## Scope boundaries

- No backend (Plans 3a/3c/3e own it).
- No reveal compose (Plan 3d) — the content flow's final step still calls the existing `finalizeWizard` for now; Plan 3d replaces that with the real-content reveal.
- No deletion of the classic flow — that is a cleanup after the holdout concludes.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend-main/src/lib/wizard/machine.ts` | modify | `buildContentSteps`; `answered` cases for content steps; content `CHAPTERS`. |
| `frontend-main/src/lib/wizard/types.ts` | modify | `WizardAnswers` gains `course_created`/`event_created`/`blog_created` flags. |
| `frontend-main/src/lib/wizard/__tests__/machine-content.test.ts` | create | Vitest for the content step builder. |
| `frontend-main/src/lib/wizard/api.ts` | modify | `provisionWizard`, `getCourseOutlines`, `createWizardCourse/Event/Blog`. |
| `frontend-main/src/app/signup/verify/wizard/content-steps.tsx` | create | `CourseStep`, `EventStep`, `BlogStep`, `ProvisioningGate`. |
| `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx` | modify | Select builder by bucket; render content steps; provision on chapter entry. |
| `frontend-main/messages/en/wizard.json`, `messages/tr/wizard.json` | modify | Content-step copy. |
| `backend/apps/core/onboarding/wizard_catalog.py` | modify | `validate_answers` tolerates the content flags. |

---

### Task 1: Content-first step machine

**Files:**
- Modify: `frontend-main/src/lib/wizard/machine.ts`, `types.ts`
- Test: `frontend-main/src/lib/wizard/__tests__/machine-content.test.ts` (create)

**Interfaces:**
- Produces: `buildContentSteps(catalog, answers) -> StepDef[]` with chapters `business → content → logo → launch`. Step ids: `business.niche`, `business.describe`, (`business.followups`), `business.goals`, `content.course`, (`content.event` iff goals include `run_live_classes`/`in_person_events`), (`content.blog` iff goals include `write_blog`), `logo`, `review`. `answered` returns true for a content step once its `*_created` flag is set OR it was explicitly skipped.

- [ ] **Step 1: Write the failing tests**

Create `frontend-main/src/lib/wizard/__tests__/machine-content.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildContentSteps } from "@/lib/wizard/machine";
import type { WizardAnswers, WizardCatalog } from "@/lib/wizard/types";

const catalog = { page_layouts: {} } as unknown as WizardCatalog;
const ids = (a: WizardAnswers) => buildContentSteps(catalog, a).map((s) => s.id);

describe("buildContentSteps", () => {
  it("always includes niche, describe, goals, course, logo, review", () => {
    expect(ids({ goals: [] })).toEqual([
      "business.niche",
      "business.describe",
      "business.goals",
      "content.course",
      "logo",
      "review",
    ]);
  });

  it("adds the event step only for live/onsite goals", () => {
    expect(ids({ goals: ["run_live_classes"] })).toContain("content.event");
    expect(ids({ goals: ["sell_courses"] })).not.toContain("content.event");
  });

  it("adds the blog step only when blogging is a goal", () => {
    expect(ids({ goals: ["write_blog"] })).toContain("content.blog");
    expect(ids({ goals: ["sell_downloads"] })).not.toContain("content.blog");
  });

  it("inserts the followups step when followups exist", () => {
    const a: WizardAnswers = {
      goals: [],
      description_followups: { items: [{ q: "?", a: "" }] } as never,
    };
    expect(ids(a)).toContain("business.followups");
  });

  it("has no look.* or pages.* steps", () => {
    const all = ids({ goals: ["run_live_classes", "write_blog"] });
    expect(all.some((id) => id.startsWith("look."))).toBe(false);
    expect(all.some((id) => id.startsWith("pages."))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend-main && npx vitest run src/lib/wizard/__tests__/machine-content.test.ts`
Expected: FAIL — `buildContentSteps` not exported.

- [ ] **Step 3: Implement `buildContentSteps` + answers flags**

In `types.ts`, extend `WizardAnswers`:

```typescript
  /** Content-first flow: set once the coach creates (or skips) each item. */
  course_created?: boolean;
  event_created?: boolean;
  blog_created?: boolean;
```

In `machine.ts`, add the content `CHAPTERS` value and the builder (reuse the existing `SELLING_GOALS`/`PAGE_ORDER` conventions; note this does NOT touch `buildSteps`):

```typescript
export const CONTENT_CHAPTERS = ["business", "content", "logo", "launch"] as const;

const EVENT_GOALS = ["run_live_classes", "in_person_events"];

export function buildContentSteps(
  catalog: WizardCatalog,
  answers: WizardAnswers,
): StepDef[] {
  const goals = answers.goals ?? [];
  const steps: StepDef[] = [
    { id: "business.niche", chapter: "business" },
    { id: "business.describe", chapter: "business" },
  ];
  if ((answers.description_followups?.items?.length ?? 0) > 0) {
    steps.push({ id: "business.followups", chapter: "business" });
  }
  steps.push(
    { id: "business.goals", chapter: "business" },
    { id: "content.course", chapter: "content" as ChapterId },
  );
  if (goals.some((g) => EVENT_GOALS.includes(g))) {
    steps.push({ id: "content.event", chapter: "content" as ChapterId });
  }
  if (goals.includes("write_blog")) {
    steps.push({ id: "content.blog", chapter: "content" as ChapterId });
  }
  steps.push(
    { id: "logo", chapter: "logo" },
    { id: "review", chapter: "launch" },
  );
  return steps;
}
```

Add `"content"` to the `ChapterId` union (the `CHAPTERS`/`ChapterId` type in machine.ts) so `chapter: "content"` typechecks — extend the union, do not replace it (classic still uses `look`/`pages`).

Then extend `answered` with content cases (near the existing switch):

```typescript
    case "content.course":
      return answers.course_created === true;
    case "content.event":
      return answers.event_created === true;
    case "content.blog":
      return answers.blog_created === true;
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend-main && npx vitest run src/lib/wizard/__tests__/machine-content.test.ts` → PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `make typecheck` → PASS.

```bash
git add frontend-main/src/lib/wizard/machine.ts frontend-main/src/lib/wizard/types.ts frontend-main/src/lib/wizard/__tests__/machine-content.test.ts
git commit -m "feat(wizard): content-first step builder"
```

---

### Task 2: Wizard content API client

**Files:**
- Modify: `frontend-main/src/lib/wizard/api.ts`

**Interfaces:**
- Produces: `provisionWizard(token) -> {status}`, `getCourseOutlines(token) -> {outlines: Outline[]}`, `createWizardCourse(token, body)`, `createWizardEvent(token, body)`, `createWizardBlog(token, body)` — all POST, token-in-body, via the existing `request<T>()` helper.

- [ ] **Step 1: Add the client functions**

Append to `lib/wizard/api.ts` (mirroring the existing `finalizeWizard` shape):

```typescript
export interface CourseOutline {
  title: string;
  description: string;
  suggested_price: number;
}

export function provisionWizard(token: string): Promise<{ status: string }> {
  return request("/api/v1/onboarding/wizard/provision/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getCourseOutlines(
  token: string,
): Promise<{ outlines: CourseOutline[] }> {
  return request("/api/v1/onboarding/wizard/content/course-outlines/", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function createWizardCourse(
  token: string,
  body: { title: string; description?: string; price?: number },
): Promise<{ id: number; slug: string }> {
  return request("/api/v1/onboarding/wizard/content/course/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}

export function createWizardEvent(
  token: string,
  body: { kind: "live" | "onsite"; title: string; scheduled_at?: string },
): Promise<{ id: number }> {
  return request("/api/v1/onboarding/wizard/content/event/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}

export function createWizardBlog(
  token: string,
  body: { title: string; body_html?: string; status?: "draft" | "published" },
): Promise<{ id: number; slug: string }> {
  return request("/api/v1/onboarding/wizard/content/blog/", {
    method: "POST",
    body: JSON.stringify({ token, ...body }),
  });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `make typecheck` → PASS.

```bash
git add frontend-main/src/lib/wizard/api.ts
git commit -m "feat(wizard): content-creation API client"
```

---

### Task 3: Content step components

**Files:**
- Create: `frontend-main/src/app/signup/verify/wizard/content-steps.tsx`
- Modify: `frontend-main/messages/en/wizard.json`, `messages/tr/wizard.json`

**Interfaces:**
- Produces: `ProvisioningGate` (renders children once `status==="provisioned"`, else a "setting up" state, calling `provisionWizard` on mount and polling), `CourseStep`, `EventStep`, `BlogStep` — each takes `{ token, answers, onDone(patch), onSkip }` and renders its mini-form.

- [ ] **Step 1: Add wizard copy**

In `frontend-main/messages/en/wizard.json`, under the `wizard` object, add a `content` block (and mirror in `tr/wizard.json` with Turkish):

```json
    "content": {
      "provisioning": "Setting up your studio…",
      "courseTitle": "Create your first course",
      "coursePrompt": "Pick a starting point — you can edit everything later.",
      "eventTitle": "Schedule your first event",
      "blogTitle": "Publish your first post",
      "skip": "I'll do this later",
      "priceLabel": "Price",
      "titleLabel": "Title",
      "dateLabel": "Date",
      "saving": "Saving…"
    }
```

- [ ] **Step 2: Implement the components**

Create `frontend-main/src/app/signup/verify/wizard/content-steps.tsx`. This is UI following the wizard's existing step-component conventions (read `steps.tsx` for the `SlideHeader`/button idioms and copy them). Key behaviors, all present in this file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  createWizardBlog,
  createWizardCourse,
  createWizardEvent,
  getCourseOutlines,
  provisionWizard,
  type CourseOutline,
} from "@/lib/wizard/api";
import type { WizardAnswers } from "@/lib/wizard/types";

/** Provision on mount, poll status until the schema exists, then reveal
 *  children. The content steps can only write once status is 'provisioned'. */
export function ProvisioningGate({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("wizard");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const { status } = await provisionWizard(token);
      if (!alive) return;
      if (status === "provisioned" || status === "ready") setReady(true);
      else timer = setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token]);

  if (!ready) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner />
        <p className="text-sm text-muted-foreground">{t("content.provisioning")}</p>
      </div>
    );
  }
  return <>{children}</>;
}

interface StepProps {
  token: string;
  answers: WizardAnswers;
  onDone: (patch: Partial<WizardAnswers>) => void;
  onSkip: () => void;
}

export function CourseStep({ token, onDone, onSkip }: StepProps) {
  const t = useTranslations("wizard");
  const [outlines, setOutlines] = useState<CourseOutline[] | null>(null);
  const [chosen, setChosen] = useState<CourseOutline | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getCourseOutlines(token).then((r) => setOutlines(r.outlines));
  }, [token]);

  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    try {
      await createWizardCourse(token, {
        title: chosen.title,
        description: chosen.description,
        price: chosen.suggested_price,
      });
      onDone({ course_created: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("content.courseTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("content.coursePrompt")}</p>
      {outlines === null ? (
        <Spinner />
      ) : (
        <div className="grid gap-2">
          {outlines.map((o) => (
            <button
              key={o.title}
              type="button"
              onClick={() => setChosen(o)}
              className={`rounded-lg border p-3 text-left ${chosen === o ? "border-primary" : ""}`}
            >
              <div className="font-medium">{o.title}</div>
              <div className="text-xs text-muted-foreground">{o.description}</div>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <button type="button" onClick={onSkip} className="text-sm underline">
          {t("content.skip")}
        </button>
        <Button onClick={save} disabled={!chosen} loading={saving}>
          {t("common.continue")}
        </Button>
      </div>
    </div>
  );
}

export function EventStep({ token, onDone, onSkip }: StepProps) {
  const t = useTranslations("wizard");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await createWizardEvent(token, {
        kind: "live",
        title,
        scheduled_at: date ? new Date(date).toISOString() : undefined,
      });
      onDone({ event_created: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("content.eventTitle")}</h2>
      <label className="block text-sm">
        {t("content.titleLabel")}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <label className="block text-sm">
        {t("content.dateLabel")}
        <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onSkip} className="text-sm underline">{t("content.skip")}</button>
        <Button onClick={save} disabled={!title} loading={saving}>{t("common.continue")}</Button>
      </div>
    </div>
  );
}

export function BlogStep({ token, onDone, onSkip }: StepProps) {
  const t = useTranslations("wizard");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await createWizardBlog(token, { title, status: "published" });
      onDone({ blog_created: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("content.blogTitle")}</h2>
      <label className="block text-sm">
        {t("content.titleLabel")}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onSkip} className="text-sm underline">{t("content.skip")}</button>
        <Button onClick={save} disabled={!title} loading={saving}>{t("common.continue")}</Button>
      </div>
    </div>
  );
}
```

(These are intentionally minimal forms — the wizard's visual polish lives in `steps.tsx`'s shared `SlideHeader`/`OptionCard`; wrap these in those wrappers to match. Confirm `common.continue` exists in the wizard messages; the classic steps use it.)

- [ ] **Step 3: Typecheck + commit**

Run: `make typecheck` → PASS.

```bash
git add frontend-main/src/app/signup/verify/wizard/content-steps.tsx frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json
git commit -m "feat(wizard): content step components (course/event/blog) + provisioning gate"
```

---

### Task 4: Select the flow by bucket and render content steps

**Files:**
- Modify: `frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx`
- Modify: `backend/apps/core/onboarding/wizard_catalog.py` (`validate_answers` tolerance)

**Interfaces:**
- Consumes: `buildContentSteps` (Task 1), content components (Task 3), `wizard_bucket` from the state response (Plan 3e).

- [ ] **Step 1: Tolerate the content flags in `validate_answers`**

In `backend/apps/core/onboarding/wizard_catalog.py`, in `validate_answers`, add accepted boolean keys so the flags don't get rejected. Read the existing `if key == ... elif ...` chain and add:

```python
        elif key in ("course_created", "event_created", "blog_created"):
            if not isinstance(value, bool):
                errors.append(f"{key} must be a boolean")
```

(If the chain silently ignores unknown keys rather than erroring, still add this branch so the flags are explicitly valid and documented.)

- [ ] **Step 2: Branch the flow in `WizardFlow.tsx`**

Read the state response where the wizard reads `state`/bucket (the `readWizardState` result). Select the builder:

```tsx
// bucket comes from the wizard-state response (Plan 3e). Empty/'control' -> classic.
const isContentFlow = bucket === "treatment";
const steps = useMemo(
  () => (isContentFlow ? buildContentSteps(catalog, answers) : buildSteps(catalog, answers)),
  [isContentFlow, catalog, answers],
);
```

Import `buildContentSteps` alongside `buildSteps`. Thread `bucket` from the `readWizardState` response into the component (it is on the state body as `wizard_bucket`).

- [ ] **Step 3: Render content steps + provision on chapter entry**

In the `switch (step.id)` add cases, wrapping content steps in `ProvisioningGate` so the schema exists before the form writes:

```tsx
      case "content.course":
        return (
          <ProvisioningGate token={token}>
            <CourseStep token={token} answers={answers} onDone={commitContent} onSkip={skipContent} />
          </ProvisioningGate>
        );
      case "content.event":
        return (
          <ProvisioningGate token={token}>
            <EventStep token={token} answers={answers} onDone={commitContent} onSkip={skipContent} />
          </ProvisioningGate>
        );
      case "content.blog":
        return (
          <ProvisioningGate token={token}>
            <BlogStep token={token} answers={answers} onDone={commitContent} onSkip={skipContent} />
          </ProvisioningGate>
        );
```

Where `commitContent`/`skipContent` persist the answer flag and advance, modeled on the existing `commit(...)` helper:

```tsx
  const advance = (patch: Partial<WizardAnswers>) => {
    const next = nextStep(steps, step.id);
    void commit(patch, next?.id ?? "review");
  };
  const commitContent = (patch: Partial<WizardAnswers>) => advance(patch);
  const skipContent = () => advance({});  // no flag set → publish gate/checklist catches it
```

(`ProvisioningGate` calls `wizard/provision/` on mount, so entering the first content step provisions the schema; subsequent content steps find it already `provisioned` and render immediately.)

- [ ] **Step 4: Typecheck + verify classic flow unaffected**

Run: `make typecheck` → PASS.
Run: `make e2e-spec SPEC=01-signup-onboarding` → PASS. This spec exercises today's wizard; since seeded dev tenants and existing signups have an empty/`control` bucket, it must still take the classic path unchanged. If it fails because the bucket is undefined, confirm Step 2 treats missing/empty bucket as classic.

- [ ] **Step 5: Commit**

```bash
git add frontend-main/src/app/signup/verify/wizard/WizardFlow.tsx backend/apps/core/onboarding/wizard_catalog.py
git commit -m "feat(wizard): select content-first flow by holdout bucket"
```

---

### Task 5: End-to-end treatment-flow spec

**Files:**
- Create: `e2e/specs/26-content-first-wizard.spec.ts`
- Modify: `e2e/impact-map.json` (map the new spec)

**Interfaces:** none; proves the full treatment flow against the running stack (Plans 3a+3c+3e must be deployed to dev).

- [ ] **Step 1: Write the spec**

The holdout makes the flow non-deterministic per email, so the spec must land in `treatment`. Two options — pick the one that fits the e2e harness:
  (a) Seed a signup whose `email:region` hashes to `treatment` (compute the hash offline and hard-code that email), or
  (b) add a dev-only query param / header the verify view honors to force a bucket in non-prod (guard with `settings.DEBUG`).

Prefer (a) — no production surface. Compute an email whose `assign_wizard_bucket("<email>:global")` returns `treatment` and use it. The spec then: signs up → verifies → asserts the Content chapter appears → picks a course outline → sees "setting up your studio" resolve → creates the course → reaches the reveal.

Write the spec mirroring `e2e/specs/01-signup-onboarding.spec.ts`'s structure (signup form → verify link from the email sink → wizard steps). Assert:
- the Content step heading (`content.courseTitle` copy) renders,
- after choosing an outline and continuing, no error toast appears,
- the wizard reaches the review/reveal step.

- [ ] **Step 2: Map the spec**

Add an entry to `e2e/impact-map.json` for `26-content-first-wizard.spec.ts` covering the onboarding wizard areas (mirror `01-signup-onboarding`'s mapping). The `make lint` selector self-test fails if a spec has no map entry.

- [ ] **Step 3: Run**

Run: `make e2e-spec SPEC=26-content-first-wizard`
Expected: PASS against the dev stack with Plans 3a/3c/3e deployed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/26-content-first-wizard.spec.ts e2e/impact-map.json
git commit -m "test(wizard): e2e content-first treatment flow"
```

---

## Verification before calling this plan done

- [ ] `cd frontend-main && npx vitest run` passes, including the content machine test.
- [ ] `make typecheck` passes.
- [ ] `make e2e-spec SPEC=01-signup-onboarding` (classic/control) and `SPEC=26-content-first-wizard` (treatment) both pass.
- [ ] `make lint` passes (includes the e2e impact-map self-test).
- [ ] Manual: a `control`-bucket signup shows today's Theme/Font/Navbar/Hero/Pages steps; a `treatment`-bucket signup shows Course/Event/Blog steps and provisions its schema on entering the Content chapter.

## Where this sits in Plan 3

| Sub-plan | Scope | Depends on |
|----------|-------|------------|
| 3a — Lazy provisioning foundation | schema step, endpoint, cleanup | Plan 1 |
| **3b — Content-first wizard (frontend)** (this one) | content flow behind the bucket | 3a, 3c, 3e |
| 3c — Content-creation APIs | course-outline AI + create endpoints | 3a |
| 3d — Reveal + compose fallback | compose from real content; fallback; replaces `finalizeWizard` reveal | 3c |
| 3e — Wizard holdout | bucket assignment + report | Plan 1 |
