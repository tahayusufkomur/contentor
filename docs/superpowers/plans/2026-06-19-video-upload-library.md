# Site-builder Video Field: Upload + URL + Library (sub-project C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the site-builder video block all three sources — paste a URL, upload a file, or reuse a library video — by extending the shared `VideoPicker` (adding URL paste + fixing its broken upload) and wiring it into the field renderer.

**Architecture:** Frontend-only. The block field stores `{ url, video_id }`; the backend already creates standalone `Video`s, supports the `library` upload category, and re-signs block `video_id`s on read. Extend `VideoPicker` with an optional `allowUrl` URL input and fix its upload `category` from `"video"` (needs `lesson_id`) to `"library"` (needs `video_id`). Then the block field's `video` case renders `<VideoPicker allowUrl>` with a `{url, video_id}` adapter.

**Tech Stack:** Next.js 14, React (client components), Tailwind v3 (CSS-var tokens), TypeScript.

## Global Constraints

- **Frontend-only.** No backend, no migration. The `library` upload flow, video
  endpoints, and block `video_id` re-signing all already exist.
- **Don't break the two existing `VideoPicker` callers** (`course-form.tsx`,
  `inline-edit-panel.tsx`): keep the `onChange(videoId, signedUrl)` signature;
  the new URL input is gated behind `allowUrl` (default off) so those screens are
  visually unchanged. They gain a *working* upload as a side effect of the
  category fix.
- **Token-only color** (house rule): reuse the token classes already in the file.
- Never commit unless the user has authorized it (repo CLAUDE.md). The user is in
  commit-per-task mode for this punch-list. Each task ends with a commit.
- Work dir: `~/ws/projects-in-progress/contentor`.

---

### Task 1: Extend `VideoPicker` — add `allowUrl` URL input + fix the upload

**Files:**
- Modify: `frontend-customer/src/components/admin/video-picker.tsx`

**Interfaces:**
- Produces: `VideoPickerProps` gains `allowUrl?: boolean`. Consumed by Task 2.
- The `onChange(videoId, signedUrl)` signature is unchanged.

- [ ] **Step 1: Add the `allowUrl` prop**

In `VideoPickerProps`, add:

```ts
  allowUrl?: boolean
```

and destructure it in the component signature with a default:

```ts
export function VideoPicker({ value, previewUrl, onChange, allowUrl = false }: VideoPickerProps) {
```

- [ ] **Step 2: Render the URL input (when `allowUrl`)**

Inside the outer `<div className="space-y-2">`, immediately **after** the
preview/buttons row `<div className="flex items-center gap-3">…</div>` and
**before** the `{open && ( … )}` panel, add:

```tsx
      {allowUrl && (
        <Input
          value={value == null ? (previewUrl ?? "") : ""}
          onChange={(e) => onChange(null, e.target.value || null)}
          placeholder="YouTube, Vimeo, or direct video URL"
          className="text-sm"
        />
      )}
```

(The URL box shows the pasted URL only when no library video is selected
(`value == null`); selecting a library/uploaded video — `value != null` —
leaves it blank and the thumbnail shows the chosen video. Typing a URL clears
`video_id` via `onChange(null, …)`.)

- [ ] **Step 3: Fix the upload category**

In `handleUpload`, change the **presign** body and the **complete** body from
`category: "video"` to `category: "library"`, and add `file_size` to the
complete body. The presign call becomes:

```ts
      const { upload_url, s3_key } = await clientFetch<PresignResponse>(
        "/api/v1/upload/presign/",
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            category: "library",
          }),
        }
      )
```

and the complete call becomes:

```ts
      await clientFetch("/api/v1/upload/complete/", {
        method: "POST",
        body: JSON.stringify({
          s3_key,
          category: "library",
          video_id: videoData.id,
          duration_seconds,
          file_size: file.size,
        }),
      })
```

(Everything else in `handleUpload` — create `Video`, PUT to S3, refetch, then
`onChange(updated.id, updated.video_signed_url)` — is unchanged.)

- [ ] **Step 4: Typecheck**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit && echo TSC_CLEAN'
```
Expected: `TSC_CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/admin/video-picker.tsx
git commit -m "fix(video): use library upload category + add allowUrl paste to VideoPicker"
```

---

### Task 2: Wire the block field's `video` case to `VideoPicker`

**Files:**
- Modify: `frontend-customer/src/components/owner/field-renderer.tsx`

**Interfaces:**
- Consumes: `VideoPicker` + its new `allowUrl` prop (Task 1).

- [ ] **Step 1: Import `VideoPicker`**

Add to the imports near the top (with the other component imports, e.g. below the
`PhotoPicker` import):

```ts
import { VideoPicker } from "@/components/admin/video-picker";
```

- [ ] **Step 2: Replace the `video` case**

Replace the entire `case "video":` block (the plain URL `<Input>`) with:

```tsx
    case "video":
      return (
        <div className="space-y-1">
          <FieldLabel field={field} />
          <VideoPicker
            allowUrl
            value={value?.video_id ?? null}
            previewUrl={value?.url ?? null}
            onChange={(videoId, signedUrl) =>
              onChange({ url: signedUrl, video_id: videoId })
            }
          />
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
        </div>
      );
```

(Stored shape `{ url, video_id }` is preserved: URL paste → `{url, video_id:
null}`; upload/library → `{url: signed, video_id: id}`; clear → `{url: null,
video_id: null}`. The repeater `emptyItem` seed already initializes `video` as
`{ url: null, video_id: null }`.)

- [ ] **Step 3: Typecheck**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit && echo TSC_CLEAN'
```
Expected: `TSC_CLEAN`.

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/owner/field-renderer.tsx
git commit -m "feat(site-builder): video block field gains upload + URL + library via VideoPicker"
```

---

### Task 3: Verification (typecheck + live multi-source video test)

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
Wait for `nextjs-customer` Ready (`docker compose logs -f nextjs-customer`).

- [ ] **Step 3: Editor video-block test** (real tenant, e.g.
  `http://tahaws.localhost`, owner/edit mode), on a Video block:
  1. **URL paste:** paste a YouTube URL → the block renders the embed; reload →
     persists. Paste a direct `.mp4` URL → `<video>` plays.
  2. **Upload:** Choose video → Upload → pick a small local `.mp4` → progress
     bar completes → it's selected and plays in the editor; view the public page
     → it plays (URL re-signed by the serializer).
  3. **Library:** Choose video → the just-uploaded video is in the list → select
     it → loads.
  4. **Clear (X):** field empties.

- [ ] **Step 4: Shared-component regression check**
  - Open the **course form** (course intro video) and a **lesson** in the inline
    edit panel: the `VideoPicker` renders **without** a URL box (`allowUrl` off),
    and an **upload now succeeds** (previously 400'd on `category: "video"`).

- [ ] **Step 5: Tear down (preserve data)**

```bash
docker compose down   # NOT -v (keep the seeded dev DB)
```

- [ ] **Step 6: Report**

Confirm `TSC_CLEAN` and each check; report deviations before claiming done.

---

## Self-Review

**Spec coverage:**
- URL paste in block field → Task 1 Step 2 (`allowUrl` input) + Task 2 wiring. ✓
- Upload in block field → Task 1 Step 3 (category fix) + Task 2 wiring. ✓
- Library reuse → already in `VideoPicker`; exposed via Task 2 wiring. ✓
- Upload-bug fix (shared) → Task 1 Step 3. ✓
- Frontend-only / no signature break / token-only → Global Constraints. ✓
- Verification incl. shared-component regression → Task 3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact literals.

**Type consistency:** `allowUrl?: boolean` added in Task 1, used in Task 2;
`onChange(videoId, signedUrl)` unchanged so existing callers compile; block
adapter maps to/from `{ url, video_id }` consistently with `emptyItem` and the
backend `_sign_assets`/`_clean_block`.
