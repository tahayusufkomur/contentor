# Courses Block Display Options (sub-project B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four display options to the coach site-builder Courses block — column count (2/3/4), card style (Elevated/Bordered/Minimal/Overlay), a search-&-filters toggle, and independent price/meta toggles — all frontend-only, defaults reproducing today's rendering.

**Architecture:** New `courseGrid` block **data** fields (not `style` overrides — the backend passes block data through `_clean_block` untouched), wired `CourseGridBlock → CourseCatalogClient → CourseCard`. The catalog client maps a column count to a literal Tailwind grid class and conditionally renders the toolbar; the card gains a `variant` prop with four token-only style branches plus `showPrice`/`showMeta` gates.

**Tech Stack:** Next.js 14, React (client components), Tailwind v3 (CSS-var tokens), TypeScript, shadcn `Card`.

## Global Constraints

- **Frontend-only.** No backend, no migration, no allowlist change — the new
  fields are block data and pass through `_clean_block`'s `dict(raw)`.
- **Token-only color** (house rule): only semantic tokens
  (`primary`/`background`/`foreground`/`muted`/`accent`/`card`), never raw
  colors. The Overlay scrim uses `from-background/90` (token opacity), never
  `from-black`. (Sole sanctioned literal `text-white` is not needed here.)
- **Tailwind JIT needs literal class strings** — every grid/scrim utility must
  be a full string literal (no dynamic `grid-cols-${n}` concatenation).
- **Defaults preserve current rendering:** 3 columns, Elevated card, toolbar +
  price + meta all shown. Undefined field → current behavior (`x !== false`,
  `Number(x) || 3`).
- Changes confined to `frontend-customer`; do not touch `frontend-main`.
- Never commit unless the user has authorized it (repo CLAUDE.md). Each task ends
  with a *suggested* commit.
- Work dir: `~/ws/projects-in-progress/contentor`.

---

### Task 1: Add the four option fields to the `courseGrid` block

**Files:**
- Modify: `frontend-customer/src/lib/blocks/registry.tsx` (the `courseGrid`
  entry's `defaultData` and `fields`)

**Interfaces:**
- Produces: the field keys/values consumed by Tasks 3–4 — `columns` (string
  `"2"|"3"|"4"`), `cardStyle` (string, one of `elevated|bordered|minimal|
  overlay`), `showFilters`/`showPrice`/`showMeta` (booleans).

- [ ] **Step 1: Extend `defaultData`**

In the `courseGrid` block (currently
`defaultData: { layout: "standard", heading: "Courses", limit: 0 }`), replace
with:

```ts
    defaultData: {
      layout: "standard",
      heading: "Courses",
      limit: 0,
      columns: "3",
      cardStyle: "elevated",
      showFilters: true,
      showPrice: true,
      showMeta: true,
    },
```

- [ ] **Step 2: Add the field controls**

In the same block's `fields` array, after the
`{ key: "limit", … }` entry, add:

```ts
      {
        key: "columns",
        label: "Columns",
        type: "select",
        options: [
          { label: "2 columns", value: "2" },
          { label: "3 columns", value: "3" },
          { label: "4 columns", value: "4" },
        ],
      },
      {
        key: "cardStyle",
        label: "Card style",
        type: "select",
        options: [
          { label: "Elevated", value: "elevated" },
          { label: "Bordered", value: "bordered" },
          { label: "Minimal", value: "minimal" },
          { label: "Overlay", value: "overlay" },
        ],
      },
      { key: "showFilters", label: "Show search & filters", type: "toggle" },
      { key: "showPrice", label: "Show price", type: "toggle" },
      { key: "showMeta", label: "Show instructor & lessons", type: "toggle" },
```

(`select` and `toggle` are already rendered by `owner/field-renderer.tsx`; no
renderer change.)

- [ ] **Step 3: Typecheck**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit && echo TSC_CLEAN'
```
Expected: `TSC_CLEAN`.

- [ ] **Step 4: Suggested commit (await user OK)**

```bash
git add frontend-customer/src/lib/blocks/registry.tsx
git commit -m "feat(site-builder): add columns/cardStyle/show-filters/price/meta fields to Courses block"
```

---

### Task 2: Add style variants + price/meta props to `CourseCard`

**Files:**
- Modify: `frontend-customer/src/components/public/course-card.tsx`

**Interfaces:**
- Produces: `export type CourseCardVariant = "elevated" | "bordered" |
  "minimal" | "overlay"` and the new `CourseCardProps`:
  `{ course: Course; variant?: CourseCardVariant; showPrice?: boolean;
  showMeta?: boolean }`. Consumed by Task 3 (`CourseCatalogClient`).
- Consumes: existing `Course` type, `Card`/`CardContent`, `PriceBadge`,
  `BookOpen`, `Link`.

- [ ] **Step 1: Export the variant type and widen the props**

At the top of the file (after imports), add:

```ts
export type CourseCardVariant = "elevated" | "bordered" | "minimal" | "overlay";

interface CourseCardProps {
  course: Course;
  variant?: CourseCardVariant;
  showPrice?: boolean;
  showMeta?: boolean;
}
```

Update the signature to:

```ts
export function CourseCard({
  course,
  variant = "elevated",
  showPrice = true,
  showMeta = true,
}: CourseCardProps) {
```

- [ ] **Step 2: Extract the reusable pieces**

Inside the component, before `return`, define the shared sub-elements so the
branches don't duplicate markup:

```tsx
  const thumb = course.thumbnail_url ? (
    <img
      src={course.thumbnail_signed_url || course.thumbnail_url}
      alt={course.title}
      className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  ) : (
    <div className="flex h-44 items-center justify-center bg-gradient-to-br from-primary/20 to-accent/10">
      <span className="text-5xl font-bold text-primary/30">
        {course.title.charAt(0)}
      </span>
    </div>
  );

  const meta = showMeta ? (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{course.instructor_name}</span>
      {course.lesson_count !== undefined && (
        <span className="flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          {course.lesson_count} lesson{course.lesson_count !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  ) : null;

  const price = showPrice ? (
    <PriceBadge
      accessInfo={course.access_info}
      price={course.price}
      pricingType={course.pricing_type}
    />
  ) : null;
```

- [ ] **Step 3: Implement the Overlay branch**

Still inside the component, before the stacked-layout return, add:

```tsx
  if (variant === "overlay") {
    return (
      <Link href={`/courses/${course.slug}`} className="group block">
        <div className="relative overflow-hidden rounded-xl">
          <div className="relative overflow-hidden">{thumb}</div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-snug line-clamp-2 text-foreground">
                {course.title}
              </h3>
              {price}
            </div>
          </div>
        </div>
        {meta && <div className="px-1 pt-3">{meta}</div>}
      </Link>
    );
  }
```

(Scrim is token-only — `from-background/90` adapts per theme; title is
`text-foreground`.)

- [ ] **Step 4: Implement the stacked branches (elevated / bordered / minimal)**

Replace the original `return ( <Link …> <Card …> … )` with a class-driven
stacked layout shared by the three non-overlay variants:

```tsx
  const stackedWrapper: Record<Exclude<CourseCardVariant, "overlay">, string> = {
    elevated:
      "group overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5",
    bordered: "group overflow-hidden transition-colors hover:border-primary/40",
    minimal: "group overflow-hidden rounded-xl border-0 bg-transparent shadow-none",
  };

  return (
    <Link href={`/courses/${course.slug}`}>
      <Card className={stackedWrapper[variant as Exclude<CourseCardVariant, "overlay">]}>
        <div className="relative overflow-hidden">{thumb}</div>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug line-clamp-2">{course.title}</h3>
            {price}
          </div>
          {meta}
        </CardContent>
      </Card>
    </Link>
  );
```

Notes: `elevated` keeps today's exact classes (no visual change at the default).
`bordered` keeps `Card`'s default `border` but drops the lift/shadow. `minimal`
strips the card surface (`border-0 bg-transparent shadow-none`). `Card` already
applies `rounded-xl`.

- [ ] **Step 5: Typecheck**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit && echo TSC_CLEAN'
```
Expected: `TSC_CLEAN`.

- [ ] **Step 6: Suggested commit (await user OK)**

```bash
git add frontend-customer/src/components/public/course-card.tsx
git commit -m "feat(site-builder): add Elevated/Bordered/Minimal/Overlay card styles + price/meta toggles to CourseCard"
```

---

### Task 3: Wire columns + filter toggle + card props into `CourseCatalogClient`

**Files:**
- Modify: `frontend-customer/src/components/public/course-catalog-client.tsx`

**Interfaces:**
- Consumes: `CourseCardVariant` and the widened `CourseCard` props from Task 2.
- Produces: the `CourseCatalogClientProps` consumed by Task 4 —
  `{ courses: Course[]; columns?: number; showFilters?: boolean;
  cardStyle?: CourseCardVariant; showPrice?: boolean; showMeta?: boolean }`.

- [ ] **Step 1: Import the variant type and widen props**

Update the `CourseCard` import line to also import the type:

```ts
import { CourseCard, type CourseCardVariant } from '@/components/public/course-card'
```

Replace the props interface + signature:

```ts
interface CourseCatalogClientProps {
  courses: Course[]
  columns?: number
  showFilters?: boolean
  cardStyle?: CourseCardVariant
  showPrice?: boolean
  showMeta?: boolean
}

export function CourseCatalogClient({
  courses,
  columns = 3,
  showFilters = true,
  cardStyle = 'elevated',
  showPrice = true,
  showMeta = true,
}: CourseCatalogClientProps) {
```

- [ ] **Step 2: Add the literal column-class map**

Above the component (module scope), add:

```ts
const COLUMN_CLASSES: Record<number, string> = {
  2: 'grid gap-4 sm:grid-cols-2',
  3: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4',
}
```

- [ ] **Step 3: Gate the toolbar behind `showFilters`**

Wrap the existing search-+-filters block — the
`<div className="flex flex-col gap-4 sm:flex-row …"> … </div>` — in
`{showFilters && ( … )}`.

- [ ] **Step 4: Use the column map and pass card props**

Replace the hardcoded grid wrapper
`<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">` with:

```tsx
        <div className={COLUMN_CLASSES[columns] ?? COLUMN_CLASSES[3]}>
```

and the card render with:

```tsx
          {filtered.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              variant={cardStyle}
              showPrice={showPrice}
              showMeta={showMeta}
            />
          ))}
```

- [ ] **Step 5: Typecheck**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit && echo TSC_CLEAN'
```
Expected: `TSC_CLEAN`.

- [ ] **Step 6: Suggested commit (await user OK)**

```bash
git add frontend-customer/src/components/public/course-catalog-client.tsx
git commit -m "feat(site-builder): apply column count, filter-bar toggle, and card props in CourseCatalogClient"
```

---

### Task 4: Pass the block fields down from `CourseGridBlock`

**Files:**
- Modify: `frontend-customer/src/components/blocks/course-grid-block.tsx`

**Interfaces:**
- Consumes: `CourseCatalogClientProps` (Task 3), `CourseCardVariant` (Task 2),
  the `data` field keys from Task 1.

- [ ] **Step 1: Pass the options to `CourseCatalogClient`**

Import the type:

```ts
import type { CourseCardVariant } from "@/components/public/course-card";
```

Replace the `<CourseCatalogClient courses={courses} />` call with:

```tsx
        <CourseCatalogClient
          courses={courses}
          columns={Number(data.columns) || 3}
          cardStyle={(data.cardStyle as CourseCardVariant) || "elevated"}
          showFilters={data.showFilters !== false}
          showPrice={data.showPrice !== false}
          showMeta={data.showMeta !== false}
        />
```

(`!== false` makes undefined → today's behavior, so pre-existing saved blocks
are unchanged.)

- [ ] **Step 2: Typecheck**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit && echo TSC_CLEAN'
```
Expected: `TSC_CLEAN`.

- [ ] **Step 3: Suggested commit (await user OK)**

```bash
git add frontend-customer/src/components/blocks/course-grid-block.tsx
git commit -m "feat(site-builder): pass Courses-block display options into CourseCatalogClient"
```

---

### Task 5: Verification (typecheck + live visual)

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit && echo TSC_CLEAN'
```
Expected: `TSC_CLEAN`.

- [ ] **Step 2: Bring up the dev stack**

```bash
docker compose up -d
```
Wait for `nextjs-customer` to report Ready (`docker compose logs -f nextjs-customer`).

- [ ] **Step 3: Visual check** in the editor on a real tenant (e.g.
  `http://tahaws.localhost`) with a Courses block, light **and** a dark theme:

  1. **Columns** 2 / 3 / 4 → grid density visibly changes.
  2. **Card style**: Elevated lifts on hover; Bordered is flat with a border;
     Minimal has no card chrome; Overlay shows the title/price over the image
     with a legible scrim — test over both a real thumbnail and the
     no-thumbnail gradient fallback.
  3. **Show search & filters** off → toolbar gone; on → toolbar back.
  4. **Show price** off → no `PriceBadge`; **Show meta** off → no instructor/
     lesson row; on → both restored.
  5. A Courses block saved **before** this change (or with the fields cleared)
     renders as before: 3 columns, Elevated, toolbar + price + meta shown.

- [ ] **Step 4: Tear down (preserve data)**

```bash
docker compose down   # NOT -v (keep the seeded dev DB)
```

- [ ] **Step 5: Report**

Confirm `TSC_CLEAN` and each visual check; report any deviation before claiming
done.

---

## Self-Review

**Spec coverage:**
- Column count (2/3/4) → Task 1 field + Task 3 column map + Task 4 wire. ✓
- Card style (Elevated/Bordered/Minimal/Overlay) → Task 1 field + Task 2 card
  branches + Task 3/4 plumb. ✓
- Show search & filters toggle → Task 1 field + Task 3 gate + Task 4 wire. ✓
- Show price / Show meta toggles → Task 1 fields + Task 2 gates + Task 3/4
  plumb. ✓
- Frontend-only / token-only / JIT-literal / defaults-preserve constraints →
  Global Constraints + each task. ✓
- Verification (tsc + light/dark visual + no-regression) → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact literals.

**Type consistency:** `CourseCardVariant` exported in Task 2, imported in Tasks 3
& 4; `CourseCatalogClientProps` produced in Task 3, consumed in Task 4; field
keys (`columns`/`cardStyle`/`showFilters`/`showPrice`/`showMeta`) consistent
across Tasks 1, 3, 4. Card-prop names (`variant`/`showPrice`/`showMeta`) match
between Task 2 (defined) and Task 3 (passed).
