# Site-builder video field: upload + URL + library (sub-project C) — design

**Date:** 2026-06-19
**Status:** Approved, pending implementation plan
**Context:** Third coach site-builder punch-list sub-project (after A block-editor
fixes and B Courses display options, both on local `main`). Punch-list item:
"for video element, we should be able to add our own video as well, so browse
option." User chose: **Upload + URL + reuse library**, and chose to **extend the
existing shared `VideoPicker`** (not build a dedicated one).

## Problem

The site-builder video block's editor control (`field-renderer.tsx`, `case
"video"`) is a **plain URL `<Input>`** — paste a YouTube/Vimeo/direct URL only.
A coach can't upload their own file or reuse a previously-uploaded video.

Meanwhile a richer **`VideoPicker`** already exists
(`components/admin/video-picker.tsx`) and is used by `course-form.tsx` and
`inline-edit-panel.tsx`. It does **library list + search + upload + inline
preview + clear** — but has **no URL paste**, and its upload is **broken**.

### The upload bug

`VideoPicker.handleUpload` creates a standalone `Video`, then calls
`POST /api/v1/upload/complete/` with `category: "video"` + `video_id`. But the
backend's `complete` view branch for `category == "video"` **requires
`lesson_id`** (returns HTTP 400 "lesson_id is required for video uploads.").
The correct branch for a standalone video is `category: "library"`, which takes
`video_id` and sets the `Video.s3_key`. So uploads via `VideoPicker` 400 today
in every caller (consistent with the unverified-merge note for this code).

## What already works (no backend change)

- `GET /api/v1/courses/videos/?search=` — paginated, searchable list (library).
- `POST /api/v1/courses/videos/` — creates a standalone `Video` (needs `title`).
- `GET /api/v1/courses/videos/{id}/` — returns `video_signed_url`.
- `POST /api/v1/upload/presign/` + `complete/` with `category: "library"` +
  `video_id` — the correct standalone upload path. All under `IsCoachOrOwner`
  (same perms as photos, which already work in the editor).
- The page serializer (`apps/tenant_config/serializers.py`) collects block
  `video_id`s and **re-signs their URLs on every read** (`_sign_assets`), so a
  block storing `{ url, video_id }` stays playable as the signed URL rotates.
- `VideoBlock` renders `<video src={url} controls>` for direct URLs and an
  `<iframe>` embed for YouTube/Vimeo.

So sub-project C is **frontend-only**: two files.

## Goals

1. **Extend `VideoPicker`** with an optional URL-paste input (`allowUrl` prop),
   so it supports all three sources: URL, upload, library.
2. **Fix the upload** to use `category: "library"` (repairs course-form &
   inline-edit-panel uploads too).
3. **Wire** the block field's `video` case to use `<VideoPicker allowUrl>`,
   storing `{ url, video_id }`.

## Non-goals

- No backend changes (the `library` flow, video endpoints, and block re-signing
  all exist).
- No change to the `VideoPicker` `onChange(videoId, signedUrl)` signature — the
  two existing callers keep working unchanged. URL paste reuses that signature as
  `onChange(null, urlString)`.
- No redesign of `course-form` / `inline-edit-panel` (they only gain a working
  upload as a side effect of the category fix).

## Design

### 1. `VideoPicker` — add `allowUrl`, fix upload

Add an optional prop:

```ts
interface VideoPickerProps {
  value: number | null
  previewUrl: string | null
  onChange: (videoId: number | null, signedUrl: string | null) => void
  allowUrl?: boolean   // NEW — render a URL-paste input
}
```

- **URL paste (when `allowUrl`):** render a full-width URL `<Input>` under the
  preview row. Its value mirrors `previewUrl` when `value` (video_id) is null
  (i.e. the current value is a pasted URL, not a library video). On change:
  `onChange(null, e.target.value || null)` — clears any `video_id` and stores
  the raw URL as the "signed URL" slot. Placeholder:
  `"YouTube, Vimeo, or direct video URL"`. Only rendered when `allowUrl` is true,
  so existing callers are visually unchanged.
- **Upload fix:** in `handleUpload`, change the presign and complete calls from
  `category: "video"` to `category: "library"`, and include `file_size` in the
  complete body (the `library` branch persists it). The create → presign → PUT →
  complete(library, video_id) → refetch → `onChange(id, video_signed_url)` flow
  is otherwise unchanged.

### 2. `field-renderer.tsx` — use `VideoPicker` for the `video` case

Replace the plain URL `<Input>` in `case "video"` with:

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

This preserves the stored shape `{ url, video_id }` (URL paste → `{url, video_id:
null}`; upload/library → `{url: signed, video_id: id}`; clear → `{url: null,
video_id: null}`). The `emptyItem` repeater seed (`{ url: null, video_id: null }`)
and the backend re-signing already match.

## Files

- Modify: `frontend-customer/src/components/admin/video-picker.tsx` (add
  `allowUrl` + URL input; fix upload `category` → `library`, add `file_size`).
- Modify: `frontend-customer/src/components/owner/field-renderer.tsx` (import
  `VideoPicker`; replace the `video` case).

## Verification

1. `tsc --noEmit` clean for `frontend-customer`.
2. Dev stack, in the editor on a real tenant, a video block:
   - **URL paste:** paste a YouTube URL → block shows the embed; reload → still
     there. Paste a direct mp4 → `<video>` plays.
   - **Upload:** pick a local mp4 → progress bar → it appears selected and plays;
     reload the public page → still plays (re-signed by the serializer).
   - **Library:** open Choose video → the uploaded video is listed → select it →
     it loads.
   - **Clear (X):** empties the field.
3. **Regression check (shared component):** open `course-form` (course intro
   video) and a lesson video in `inline-edit-panel` — the picker renders without
   a URL box (`allowUrl` off) and an **upload now succeeds** (was 400 before).
4. No raw colors introduced; the URL input uses the house token classes already
   in the file.

## Risks

Low–moderate. The upload `category` fix changes behavior of a **shared**
component, but the old behavior was a 400, so it can only improve. The
`allowUrl`-gated URL input keeps existing callers visually identical. The main
verification effort is the live multi-source video test (upload hits real S3 /
the dev storage backend), so the visual check matters more here than in A/B.
