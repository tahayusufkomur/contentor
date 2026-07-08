# Community Phase 2 — Student UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the student-facing community feed at `/community` in `frontend-customer` — join step, composer with photos, feed with pinned posts, reactions, comments, and reporting — on top of the Phase 1 backend that is already merged to main.

**Architecture:** Client components under `src/components/community/` orchestrated by one route page in the `(student)` group, following the existing student-page idiom (`"use client"` + `clientFetch` + Skeleton/EmptyState + shadcn ui). Nav gating happens server-side in the student layout (fetch `GET /api/v1/community/settings/`, pass a prop to `PublicHeader`). No new backend work — the entire API exists (see Interfaces below).

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind + shadcn/Radix components in `src/components/ui/`, `clientFetch` from `src/lib/api-client.ts`, lucide-react icons, sonner toasts.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-06-community-feature-design.md`. Phase 1 backend plan (API reference): `docs/superpowers/plans/2026-07-06-community-phase-1-backend.md`.
- Work on branch `feat/community-phase-2` in an **isolated worktree** off local `main` (superpowers:using-git-worktrees; multiple agents share the main checkout — verify `git branch --show-current` before every commit). Phase 1 (`apps.community`) is on local main — confirm with `git log --oneline main | grep community` before starting.
- **Isolated dev stack recipe** (the shared checkout's stack mounts the shared tree, not your worktree):
  1. Copy env: `cp <main-checkout>/.env .env`, then repoint the presign host at this stack's MinIO: edit `.env` → `AWS_ENDPOINT_EXTERNAL=http://localhost:19000`.
  2. Create `docker-compose.worktree.yml` (gitignored-by-location is NOT true — do **not** commit it):
     ```yaml
     services:
       caddy:
         container_name: contentor-caddy-phase2
         ports: !override
           - "18080:80"
       postgres:
         ports: !override
           - "15432:5432"
       redis:
         ports: !override
           - "16379:6379"
       minio:
         ports: !override
           - "19000:9000"
           - "19001:9001"
     ```
     (`!override` replaces instead of appending — requires Compose ≥ 2.24; plain lists MERGE and re-collide on the shared stack's ports. The base file pins `container_name: contentor-caddy-dev`, hence the caddy rename.)
  3. `docker compose -p contentor-community-phase-2 -f docker-compose.yml -f docker-compose.worktree.yml up -d --build caddy postgres redis minio minio-init django nextjs-customer nextjs-main`
  4. The django entrypoint migrates all schemas and seeds demo tenants. Browser: **http://demo-yoga.localhost:18080** (Caddy's host matcher ignores the port; Django resolves the tenant from the hostname).
  5. Teardown when done: `docker compose -p contentor-community-phase-2 -f docker-compose.yml -f docker-compose.worktree.yml down -v`
- **Type checks:** `cd frontend-customer && npx tsc --noEmit` (run `npm install` once first if `node_modules` is missing). There is no frontend unit-test runner in this repo — verification is tsc + concrete browser checks + (in Phase 3) a Playwright spec.
- **Lint:** `pre-commit run --all-files` must pass. Note the frontends are NOT linted by pre-commit (known gap) — run `cd frontend-customer && npm run lint` yourself before the final commit.
- The student area is hardcoded English (see `(student)/dashboard/page.tsx`) — do NOT add next-intl to student components. (Admin nav i18n comes in Phase 3.)
- `clientFetch` already handles 204/empty bodies (returns `undefined`) and throws `ApiError(status, data)` — never call `res.json()` yourself.
- **`public-header.tsx` merge hazard:** the unmerged `feat/public-navbar` branch rewrites this file heavily. Keep the Phase 2 edit strictly additive and minimal (one link + one prop) so the eventual merge is trivial.
- Coach/plain users are moderators but this phase builds the **student** experience; moderator affordances land in Phase 3. Design `PostCard` with the optional `moderator` prop now (see Task 4) so Phase 3 plugs in without refactoring.
- Reaction emoji set (exact, keep order): `["❤️", "👍", "🎉", "💪", "😂"]`. Max 4 images/post. Report reasons: `spam | inappropriate | harassment | other`.

## Backend API reference (Phase 1, all under `/api/v1/community/`, tenant JWT cookie auth)

| Endpoint | Notes |
|---|---|
| `GET settings/` | `{is_enabled, welcome_message}`; module disabled is NOT an error here |
| `GET me/` | `{display_name, avatar_key, avatar, joined_at, is_moderator}` — lazily creates the member row and stamps `last_seen_at`; 404 when module disabled; 403 when banned |
| `PATCH me/` | body `{display_name?, avatar_key?}` → 200 same shape |
| `POST presign/` | `{filename, content_type}` (jpeg/png/webp/gif only) → `{upload_url, s3_key, method:"PUT", headers}` |
| `GET posts/` | cursor page `{results, next, previous}`; first page (no `?cursor=`) adds `{pinned: Post[], welcome_message}`; `next` is an absolute same-origin URL |
| `POST posts/` | `{body, image_keys?}` → 201 Post; 403 muted/banned; 429 throttled (10/h) |
| `PATCH/DELETE posts/<id>/` | own posts only (404 otherwise); PATCH marks `edited_at`; DELETE is hard delete → 204 |
| `GET/POST posts/<id>/comments/` | page-number pagination `{count,next,previous,results}` oldest-first; POST `{body}` → 201; 60/h throttle |
| `DELETE comments/<id>/` | own only → 204 |
| `PUT/DELETE posts/<id>/reaction/`, `comments/<id>/reaction/` | PUT `{emoji}` → 204 (one reaction per user, changing emoji keeps count); DELETE idempotent → 204 |
| `POST posts/<id>/report/`, `comments/<id>/report/` | `{reason, detail?}` → 204, idempotent |

Post shape: `{id, author:{id,display_name,avatar,is_coach}, body, image_keys, images, status, is_pinned, comment_count, reaction_count, my_reaction, created_at, edited_at}`. Comment shape: `{id, author, body, reaction_count, my_reaction, status, created_at}`.

## File Structure

```
frontend-customer/src/
  types/community.ts                       # API types (new)
  lib/community.ts                         # API wrappers + image upload helper (new)
  app/(student)/community/page.tsx         # route page (new)
  app/(student)/layout.tsx                 # + fetch settings, pass communityEnabled (modify)
  components/shared/public-header.tsx      # + Community nav link (modify, minimal)
  components/community/
    join-card.tsx                          # first-visit "introduce yourself"
    feed.tsx                               # feed orchestration (pinned, cursor, welcome)
    composer.tsx                           # textarea + up to 4 photos
    post-card.tsx                          # post rendering + own/moderator actions
    image-grid.tsx                         # thumbnails + lightbox (modal-portal)
    reaction-bar.tsx                       # ❤️ tap + 5-emoji picker
    comment-section.tsx                    # inline flat comments
    report-dialog.tsx                      # reason picker
    linkify.tsx                            # safe plain-text → links/line-breaks
```

---

### Task 1: Types + API client library

**Files:**
- Create: `frontend-customer/src/types/community.ts`
- Create: `frontend-customer/src/lib/community.ts`

**Interfaces:**
- Consumes: `clientFetch` from `@/lib/api-client`.
- Produces (every later task imports from these two modules): all types below, and functions `getCommunitySettings()`, `getCommunityMe()`, `updateCommunityMe(patch)`, `uploadCommunityImage(file)`, `getFeed(url?)`, `createPost(input)`, `updatePost(id, body)`, `deletePost(id)`, `getComments(postId, page?)`, `addComment(postId, body)`, `deleteComment(id)`, `setReaction(kind, id, emoji)`, `clearReaction(kind, id)`, `reportTarget(kind, id, reason, detail?)` with the exact signatures shown below.

- [ ] **Step 1: Write `types/community.ts`**

```typescript
export const REACTION_EMOJIS = ["❤️", "👍", "🎉", "💪", "😂"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export interface CommunityAuthor {
  id: number;
  display_name: string;
  avatar: string;
  is_coach: boolean;
}

export interface CommunityPost {
  id: number;
  author: CommunityAuthor;
  body: string;
  image_keys: string[];
  images: string[];
  status: "visible" | "pending" | "hidden" | "removed";
  is_pinned: boolean;
  comment_count: number;
  reaction_count: number;
  my_reaction: string | null;
  created_at: string;
  edited_at: string | null;
}

export interface CommunityComment {
  id: number;
  author: CommunityAuthor;
  body: string;
  reaction_count: number;
  my_reaction: string | null;
  status: string;
  created_at: string;
}

export interface CommunityFeedPage {
  results: CommunityPost[];
  next: string | null;
  previous: string | null;
  /** Present only on the first page (no cursor param). */
  pinned?: CommunityPost[];
  welcome_message?: string;
}

export interface CommunityCommentsPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: CommunityComment[];
}

export interface CommunityMe {
  display_name: string;
  avatar_key: string;
  avatar: string;
  joined_at: string;
  is_moderator: boolean;
}

export interface CommunitySettings {
  is_enabled: boolean;
  welcome_message: string;
  /** Moderators only. */
  notify_on_coach_post?: boolean;
}
```

- [ ] **Step 2: Write `lib/community.ts`**

```typescript
import { clientFetch } from "@/lib/api-client";
import type {
  CommunityCommentsPage,
  CommunityComment,
  CommunityFeedPage,
  CommunityMe,
  CommunityPost,
  CommunitySettings,
  ReportReason,
} from "@/types/community";

const BASE = "/api/v1/community";

export type TargetKind = "posts" | "comments";

export function getCommunitySettings(): Promise<CommunitySettings> {
  return clientFetch(`${BASE}/settings/`);
}

export function getCommunityMe(): Promise<CommunityMe> {
  return clientFetch(`${BASE}/me/`);
}

export function updateCommunityMe(
  patch: Partial<Pick<CommunityMe, "display_name" | "avatar_key">>,
): Promise<CommunityMe> {
  return clientFetch(`${BASE}/me/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Presign + PUT the file to object storage. Returns the s3_key to attach. */
export async function uploadCommunityImage(file: File): Promise<string> {
  const presign = await clientFetch<{
    upload_url: string;
    s3_key: string;
    headers: Record<string, string>;
  }>(`${BASE}/presign/`, {
    method: "POST",
    body: JSON.stringify({ filename: file.name, content_type: file.type }),
  });
  const put = await fetch(presign.upload_url, {
    method: "PUT",
    headers: presign.headers,
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return presign.s3_key;
}

/** First page when url is omitted; pass page.next verbatim for more. */
export function getFeed(url?: string | null): Promise<CommunityFeedPage> {
  return clientFetch(url || `${BASE}/posts/`);
}

export function createPost(input: {
  body: string;
  image_keys?: string[];
}): Promise<CommunityPost> {
  return clientFetch(`${BASE}/posts/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePost(id: number, body: string): Promise<CommunityPost> {
  return clientFetch(`${BASE}/posts/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export function deletePost(id: number): Promise<void> {
  return clientFetch(`${BASE}/posts/${id}/`, { method: "DELETE" });
}

export function getComments(
  postId: number,
  page = 1,
): Promise<CommunityCommentsPage> {
  return clientFetch(`${BASE}/posts/${postId}/comments/?page=${page}`);
}

export function addComment(
  postId: number,
  body: string,
): Promise<CommunityComment> {
  return clientFetch(`${BASE}/posts/${postId}/comments/`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteComment(id: number): Promise<void> {
  return clientFetch(`${BASE}/comments/${id}/`, { method: "DELETE" });
}

export function setReaction(
  kind: TargetKind,
  id: number,
  emoji: string,
): Promise<void> {
  return clientFetch(`${BASE}/${kind}/${id}/reaction/`, {
    method: "PUT",
    body: JSON.stringify({ emoji }),
  });
}

export function clearReaction(kind: TargetKind, id: number): Promise<void> {
  return clientFetch(`${BASE}/${kind}/${id}/reaction/`, { method: "DELETE" });
}

export function reportTarget(
  kind: TargetKind,
  id: number,
  reason: ReportReason,
  detail = "",
): Promise<void> {
  return clientFetch(`${BASE}/${kind}/${id}/report/`, {
    method: "POST",
    body: JSON.stringify({ reason, detail }),
  });
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend-customer && npx tsc --noEmit`
Expected: exits 0 (no new errors; if the baseline has pre-existing errors, note them and confirm none mention `community`).

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/types/community.ts frontend-customer/src/lib/community.ts
git commit -m "feat(community-ui): types + API client library"
```

---

### Task 2: Route scaffold + nav gating

**Files:**
- Create: `frontend-customer/src/app/(student)/community/page.tsx`
- Modify: `frontend-customer/src/app/(student)/layout.tsx`
- Modify: `frontend-customer/src/components/shared/public-header.tsx` (minimal, additive)

**Interfaces:**
- Consumes: `getCommunitySettings`, `getCommunityMe` from Task 1; `serverFetch` from `@/lib/api-server`; `EmptyState` from `@/components/shared/empty-state`.
- Produces: `PublicHeader` accepts a new optional prop `communityEnabled?: boolean`; the page renders `<CommunityPageBody>` states that Tasks 3–7 fill in. Page-level state contract used by later tasks: `me: CommunityMe | null`, `gate: "loading" | "disabled" | "banned" | "ok"`.

- [ ] **Step 1: Create the route page**

`frontend-customer/src/app/(student)/community/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getCommunityMe, getCommunitySettings } from "@/lib/community";
import type { CommunityMe } from "@/types/community";
import { ApiError } from "@/types/api";

type Gate = "loading" | "disabled" | "banned" | "ok";

export default function CommunityPage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [me, setMe] = useState<CommunityMe | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const settings = await getCommunitySettings();
        if (!settings.is_enabled) {
          setGate("disabled");
          return;
        }
        setMe(await getCommunityMe());
        setGate("ok");
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) setGate("banned");
        else setGate("disabled");
      }
    })();
  }, []);

  if (gate === "loading") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (gate === "disabled") {
    return (
      <EmptyState
        icon={Users}
        title="Community isn't available"
        description="This community hasn't been switched on yet."
      />
    );
  }
  if (gate === "banned") {
    return (
      <EmptyState
        icon={Users}
        title="You can't access the community"
        description="Your access has been removed by a moderator."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Community</h1>
      {/* Tasks 3-7 mount JoinCard + Feed here */}
      <p className="text-sm text-muted-foreground">
        Welcome, {me?.display_name}.
      </p>
    </div>
  );
}
```

(Check `ApiError`'s constructor in `src/types/api.ts` — it stores the HTTP status; if the property is named differently than `status`, match it.)

- [ ] **Step 2: Fetch settings in the student layout and pass the prop**

In `frontend-customer/src/app/(student)/layout.tsx`, alongside the existing `plans` fetch:

```tsx
let communityEnabled = false;
try {
  const community = await serverFetch<{ is_enabled: boolean }>(
    "/api/v1/community/settings/",
  );
  communityEnabled = community.is_enabled;
} catch {}
```

and pass it: `<PublicHeader user={user} hasSubscription={hasSubscription} communityEnabled={communityEnabled} />`.

- [ ] **Step 3: Add the nav link to PublicHeader (additive only)**

In `frontend-customer/src/components/shared/public-header.tsx`:

1. Extend the props type:
```tsx
export function PublicHeader({
  user,
  hasSubscription,
  communityEnabled,
}: {
  user?: User | null;
  hasSubscription?: boolean;
  communityEnabled?: boolean;
}) {
```
2. Immediately after the `navLinks` assignment, append a signed-in-only link:
```tsx
const fullNavLinks =
  user && communityEnabled
    ? [...navLinks, { label: "Community", href: "/community" }]
    : navLinks;
```
3. Replace both `navLinks.map(...)` call sites (desktop row and mobile menu) with `fullNavLinks.map(...)`. Change nothing else in this file.

- [ ] **Step 4: Verify in the browser**

With the isolated stack up:

1. `http://demo-yoga.localhost:18080/dashboard` logged out → log in as the demo student (or use the coach): the "Community" link must be ABSENT (default disabled).
2. Enable the module as the coach via the API (get a session by logging into the demo coach account in the browser first, then from the browser devtools console):
```js
await fetch("/api/v1/community/settings/", {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({is_enabled: true})}).then(r => r.status)  // → 200
```
3. Reload → "Community" link appears in the header; clicking it renders the page with "Welcome, <name>".
4. `GET http://demo-yoga.localhost:18080/community` while logged out → redirected to login by `requireAuth` (the `(student)` layout).

- [ ] **Step 5: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → 0 new errors.

```bash
git add frontend-customer/src/app/\(student\)/community frontend-customer/src/app/\(student\)/layout.tsx frontend-customer/src/components/shared/public-header.tsx
git commit -m "feat(community-ui): /community route + gated nav link"
```

---

### Task 3: Join card (introduce yourself) + avatar upload

**Files:**
- Create: `frontend-customer/src/components/community/join-card.tsx`
- Modify: `frontend-customer/src/app/(student)/community/page.tsx`

**Interfaces:**
- Consumes: `updateCommunityMe`, `uploadCommunityImage` (Task 1); `Avatar` components from `@/components/ui/avatar`; `Input`, `Button`, `Card` from ui.
- Produces: `<JoinCard me={me} onDone={(updated: CommunityMe) => void} />` — shown when the member hasn't personalized yet; heuristic: show once per browser via `localStorage["community_joined"]`, AND always show if `me.avatar` is empty.

- [ ] **Step 1: Create `join-card.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateCommunityMe, uploadCommunityImage } from "@/lib/community";
import type { CommunityMe } from "@/types/community";

export function JoinCard({
  me,
  onDone,
}: {
  me: CommunityMe;
  onDone: (updated: CommunityMe) => void;
}) {
  const [name, setName] = useState(me.display_name);
  const [avatarKey, setAvatarKey] = useState(me.avatar_key);
  const [preview, setPreview] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (file: File) => {
    setBusy(true);
    try {
      const key = await uploadCommunityImage(file);
      setAvatarKey(key);
      setPreview(URL.createObjectURL(file));
    } catch {
      toast.error("Photo upload failed — try a smaller image.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateCommunityMe({
        display_name: name.trim() || me.display_name,
        avatar_key: avatarKey,
      });
      localStorage.setItem("community_joined", "1");
      toast.success("Welcome to the community!");
      onDone(updated);
    } catch {
      toast.error("Couldn't save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <h2 className="text-lg font-semibold">Introduce yourself</h2>
        <p className="text-sm text-muted-foreground">
          Pick the name and photo other members will see.
        </p>
        <button
          type="button"
          className="relative"
          onClick={() => fileRef.current?.click()}
          aria-label="Choose profile photo"
        >
          <Avatar className="h-20 w-20">
            <AvatarImage src={preview} alt="" />
            <AvatarFallback>{(name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 right-0 rounded-full bg-primary p-1.5 text-primary-foreground">
            <Camera className="h-3.5 w-3.5" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickPhoto(f);
          }}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
          className="max-w-xs text-center"
          aria-label="Display name"
        />
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Join the community
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it in the page**

In `community/page.tsx`, replace the placeholder body:

```tsx
const [joined, setJoined] = useState(false);
// inside the gate === "ok" return:
const needsJoin =
  !joined && (!localStorage.getItem("community_joined") || !me?.avatar);
return (
  <div className="mx-auto max-w-2xl space-y-6">
    <h1 className="text-2xl font-bold">Community</h1>
    {needsJoin && me ? (
      <JoinCard
        me={me}
        onDone={(updated) => {
          setMe(updated);
          setJoined(true);
        }}
      />
    ) : (
      <p className="text-sm text-muted-foreground">
        Feed lands in Task 4.
      </p>
    )}
  </div>
);
```

(`localStorage` is safe here — the component is client-only and this code runs post-mount render; if Next complains about hydration, gate it behind a `mounted` state flag set in `useEffect`.)

- [ ] **Step 3: Verify in the browser**

1. Fresh student session (or `localStorage.removeItem("community_joined")`) → /community shows the join card.
2. Pick a JPG → avatar preview swaps; Save → toast, card is replaced.
3. Network tab: `POST presign/` → 200 with `upload_url` on `localhost:19000`; the PUT to MinIO → 200; `PATCH me/` → 200 with a signed `avatar` URL.
4. Reload → card does not reappear.

- [ ] **Step 4: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/components/community/ frontend-customer/src/app/\(student\)/community/
git commit -m "feat(community-ui): join card with avatar upload"
```

---

### Task 4: Feed, composer, and post cards

**Files:**
- Create: `frontend-customer/src/components/community/linkify.tsx`, `image-grid.tsx`, `composer.tsx`, `post-card.tsx`, `feed.tsx`
- Modify: `frontend-customer/src/app/(student)/community/page.tsx`

**Interfaces:**
- Consumes: Task 1 lib; `modal-portal` from `@/components/ui/modal-portal`; Avatar/Badge/Button/Card/Textarea/DropdownMenu from ui.
- Produces (Phase 3 depends on these exact props):
  - `<Feed me={me} moderator={null} />` — self-contained feed; `moderator` is `null | ModeratorHooks` where
    ```ts
    export interface ModeratorHooks {
      pin: (post: CommunityPost) => Promise<void>;
      unpin: (post: CommunityPost) => Promise<void>;
      remove: (post: CommunityPost) => Promise<void>;
      banAuthor: (post: CommunityPost) => Promise<void>;
      removeComment: (comment: CommunityComment) => Promise<void>;
    }
    ```
    (exported from `post-card.tsx`).
  - `<PostCard post me onChanged={() => void} moderator={ModeratorHooks | null} />`
  - `<Linkify text={string} />` — renders plain text with clickable http(s) links and preserved line breaks. NEVER use `dangerouslySetInnerHTML`.

- [ ] **Step 1: Create `linkify.tsx`**

```tsx
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

export function Linkify({ text }: { text: string }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {text.split(URL_RE).map((part, i) =>
        URL_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </span>
  );
}
```

(Note: `split` with a capturing-group regex interleaves matches into the array; re-testing with `URL_RE.test` needs the regex NOT to be sticky — the `g` flag on `.test` advances `lastIndex`, so use a fresh literal inside the map: `/^https?:\/\//.test(part)`.) Final version of the ternary condition: `/^https?:\/\//.test(part)`.

- [ ] **Step 2: Create `image-grid.tsx`**

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ModalPortal } from "@/components/ui/modal-portal";

export function ImageGrid({ images }: { images: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;

  return (
    <>
      <div
        className={
          images.length === 1 ? "grid grid-cols-1" : "grid grid-cols-2 gap-1"
        }
      >
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            className="overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- presigned URLs, no next/image loader */}
            <img
              src={src}
              alt=""
              className="max-h-96 w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setOpen(null)}
          >
            <button
              className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[open]}
              alt=""
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        </ModalPortal>
      )}
    </>
  );
}
```

(Check `modal-portal.tsx`'s export name first — the mailbox work added it; if it's a default export or named differently, match it.)

- [ ] **Step 3: Create `composer.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createPost, uploadCommunityImage } from "@/lib/community";
import type { CommunityPost } from "@/types/community";
import { ApiError } from "@/types/api";

const MAX_IMAGES = 4;

export function Composer({
  onPosted,
}: {
  onPosted: (post: CommunityPost) => void;
}) {
  const [body, setBody] = useState("");
  const [images, setImages] = useState<{ key: string; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList) => {
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) toast.info(`Up to ${MAX_IMAGES} photos per post.`);
    setBusy(true);
    try {
      for (const file of picked) {
        const key = await uploadCommunityImage(file);
        setImages((prev) => [
          ...prev,
          { key, preview: URL.createObjectURL(file) },
        ]);
      }
    } catch {
      toast.error("Photo upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const post = await createPost({
        body: body.trim(),
        image_keys: images.map((i) => i.key),
      });
      setBody("");
      setImages([]);
      if (post.status === "pending") {
        toast.info("Your post is waiting for a moderator's approval.");
      }
      onPosted(post);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error("You're posting too fast — try again in a bit.");
      } else if (err instanceof ApiError && err.status === 403) {
        toast.error("You can't post right now.");
      } else {
        toast.error("Couldn't publish your post.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Textarea
          placeholder="Share something with the community…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={10000}
          rows={3}
        />
        {images.length > 0 && (
          <div className="flex gap-2">
            {images.map((img) => (
              <div key={img.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.preview}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-background shadow"
                  onClick={() =>
                    setImages((prev) => prev.filter((i) => i.key !== img.key))
                  }
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || images.length >= MAX_IMAGES}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="mr-1.5 h-4 w-4" /> Photo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            onClick={submit}
            disabled={busy || (!body.trim() && images.length === 0)}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Post
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

Note: the backend requires a non-empty body (1–10000 chars). If the student posts photos with no text, `body.trim()` is `""` and the API will 400 — so keep the submit button disabled unless `body.trim()` is non-empty. Change the disabled condition to `busy || !body.trim()` and drop `images.length === 0` from it.

- [ ] **Step 4: Create `post-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MoreHorizontal, Pin } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { deletePost, updatePost } from "@/lib/community";
import type {
  CommunityComment,
  CommunityMe,
  CommunityPost,
} from "@/types/community";
import { CommentSection } from "./comment-section";
import { ImageGrid } from "./image-grid";
import { Linkify } from "./linkify";
import { ReactionBar } from "./reaction-bar";
import { ReportDialog } from "./report-dialog";

export interface ModeratorHooks {
  pin: (post: CommunityPost) => Promise<void>;
  unpin: (post: CommunityPost) => Promise<void>;
  remove: (post: CommunityPost) => Promise<void>;
  banAuthor: (post: CommunityPost) => Promise<void>;
  removeComment: (comment: CommunityComment) => Promise<void>;
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function PostCard({
  post,
  me,
  onChanged,
  moderator,
}: {
  post: CommunityPost;
  me: CommunityMe;
  onChanged: () => void;
  moderator: ModeratorHooks | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [reporting, setReporting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const isMine = post.author.display_name === me.display_name; // see note below

  const saveEdit = async () => {
    try {
      await updatePost(post.id, draft.trim());
      setEditing(false);
      onChanged();
    } catch {
      toast.error("Couldn't save the edit.");
    }
  };

  const removeOwn = async () => {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    try {
      await deletePost(post.id);
      onChanged();
    } catch {
      toast.error("Couldn't delete the post.");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={post.author.avatar} alt="" />
            <AvatarFallback>
              {post.author.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{post.author.display_name}</span>
              {post.author.is_coach && <Badge variant="secondary">Coach</Badge>}
              {post.is_pinned && (
                <Pin className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {timeAgo(post.created_at)}
                {post.edited_at ? " · edited" : ""}
              </span>
              {post.status === "pending" && (
                <Badge variant="outline">Awaiting approval</Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Post actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isMine && (
                <>
                  <DropdownMenuItem onClick={() => setEditing(true)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={removeOwn}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
              {!isMine && (
                <DropdownMenuItem onClick={() => setReporting(true)}>
                  Report
                </DropdownMenuItem>
              )}
              {moderator && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      post.is_pinned
                        ? moderator.unpin(post)
                        : moderator.pin(post)
                    }
                  >
                    {post.is_pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => moderator.remove(post)}
                  >
                    Remove post
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => moderator.banAuthor(post)}
                  >
                    Ban member
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={10000}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={!draft.trim()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(post.body);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm">
            <Linkify text={post.body} />
          </div>
        )}

        <ImageGrid images={post.images} />

        <div className="flex items-center gap-4">
          <ReactionBar
            kind="posts"
            id={post.id}
            count={post.reaction_count}
            mine={post.my_reaction}
          />
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowComments((v) => !v)}
          >
            💬 {post.comment_count}
          </button>
        </div>

        {showComments && (
          <CommentSection post={post} me={me} moderator={moderator} />
        )}

        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          kind="posts"
          id={post.id}
        />
      </CardContent>
    </Card>
  );
}
```

**Ownership note:** the API doesn't return the viewer's member id, so `isMine` can't compare ids. Two acceptable fixes — pick the first: (a) compare against `me` by adding `id` to the `me/` serializer response — small backend tweak: add `id = serializers.IntegerField(read_only=True)` to `MemberSerializer` in `backend/apps/community/serializers.py`, then `const isMine = post.author.id === me.id;` and add `id: number` to `CommunityMe`. Do (a); it is one line each side and removes a name-collision bug. Add the backend line, run `docker compose -p contentor-community-phase-2 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/ -q` (expect 54 pass), and include the change in this task's commit.

Until Tasks 5–7 land, stub the three imports so tsc passes — create minimal placeholder files in the same commit (each gets its real body in its own task):

`reaction-bar.tsx` (placeholder): `export function ReactionBar(props: { kind: "posts" | "comments"; id: number; count: number; mine: string | null }) { return <span className="text-sm text-muted-foreground">❤️ {props.count}</span>; }`

`comment-section.tsx` (placeholder): `export function CommentSection(_: { post: import("@/types/community").CommunityPost; me: import("@/types/community").CommunityMe; moderator: import("./post-card").ModeratorHooks | null }) { return null; }`

`report-dialog.tsx` (placeholder): `export function ReportDialog(_: { open: boolean; onClose: () => void; kind: "posts" | "comments"; id: number }) { return null; }`

**Deliberate deviation from the spec:** the spec says "infinite scroll"; this plan ships a **"Load more" button** instead — same cursor API, fewer scroll-listener edge cases (PWA momentum scrolling, layout shift). If the user later wants true infinite scroll, swap the button for an IntersectionObserver sentinel; the data flow doesn't change.

- [ ] **Step 5: Create `feed.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getFeed } from "@/lib/community";
import type { CommunityMe, CommunityPost } from "@/types/community";
import { Composer } from "./composer";
import { PostCard, type ModeratorHooks } from "./post-card";

export function Feed({
  me,
  moderator,
}: {
  me: CommunityMe;
  moderator: ModeratorHooks | null;
}) {
  const [pinned, setPinned] = useState<CommunityPost[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [welcome, setWelcome] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getFeed();
      setPinned(page.pinned ?? []);
      setPosts(page.results);
      setWelcome(page.welcome_message ?? "");
      setNext(page.next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!next) return;
    const page = await getFeed(next);
    setPosts((prev) => [...prev, ...page.results]);
    setNext(page.next);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {welcome && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          {welcome}
        </div>
      )}
      <Composer onPosted={() => void loadFirst()} />
      {pinned.map((post) => (
        <PostCard
          key={`pin-${post.id}`}
          post={post}
          me={me}
          onChanged={() => void loadFirst()}
          moderator={moderator}
        />
      ))}
      {posts.length === 0 && pinned.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlus}
          title="Be the first to post"
          description="Say hi and get the conversation going. 👋"
        />
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            me={me}
            onChanged={() => void loadFirst()}
            moderator={moderator}
          />
        ))
      )}
      {next && (
        <Button variant="outline" className="w-full" onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Mount the feed in the page**

In `community/page.tsx`, render below the heading (after the JoinCard block from Task 3; when `needsJoin` is false):

```tsx
{me && !needsJoin && <Feed me={me} moderator={null} />}
```

- [ ] **Step 7: Verify in the browser**

1. As the student: compose "Hello community! https://example.com" + attach 2 photos → post appears at top instantly; the URL renders as a clickable link; photos render in a 2-col grid; clicking a photo opens the lightbox; Esc/click closes.
2. Overflow menu on OWN post shows Edit/Delete; on the coach's seeded posts shows Report. Edit → change text → "edited" marker appears.
3. Create 21+ posts via devtools to test pagination:
```js
for (let i = 0; i < 22; i++) await fetch("/api/v1/community/posts/", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({body:`bulk ${i}`})});
```
   Reload → 20 posts + "Load more"; clicking loads the rest. (This also exercises the 10/h throttle → expect some 429 toasts; that's correct behavior. Reset by flushing redis: `docker compose -p contentor-community-phase-2 -f docker-compose.yml -f docker-compose.worktree.yml exec redis redis-cli FLUSHDB`.)
4. Pin one post via the API as coach (`POST /api/v1/community/moderation/posts/<id>/pin/`) → reload → it renders on top with the pin icon.
5. Welcome message: PATCH settings with `{"welcome_message": "Be kind!"}` → banner shows above the composer.

- [ ] **Step 8: Backend `me.id` test + type-check + commit**

Backend tweak test — append to `backend/apps/community/tests/test_member_api.py`:

```python
def test_me_includes_id(enabled):
    client, user = make_client(email="idcheck@x.com")
    resp = client.get("/api/v1/community/me/")
    assert resp.status_code == 200
    from apps.community.models import CommunityMember

    assert resp.json()["id"] == CommunityMember.objects.get(user=user).id
```

Run: `docker compose -p contentor-community-phase-2 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/test_member_api.py -q` → 7 passed.
Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/components/community/ frontend-customer/src/app/\(student\)/community/ backend/apps/community/serializers.py backend/apps/community/tests/test_member_api.py
git commit -m "feat(community-ui): feed, composer, post cards with images + edit/delete"
```

---

### Task 5: Reaction bar

**Files:**
- Modify: `frontend-customer/src/components/community/reaction-bar.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `setReaction`, `clearReaction` (Task 1); `REACTION_EMOJIS` from types.
- Produces: `<ReactionBar kind id count mine />` — optimistic toggle; tap toggles ❤️ (or removes your existing reaction), hovering/long-press opens the 5-emoji picker.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { clearReaction, setReaction, type TargetKind } from "@/lib/community";
import { REACTION_EMOJIS } from "@/types/community";
import { cn } from "@/lib/utils";

export function ReactionBar({
  kind,
  id,
  count,
  mine,
}: {
  kind: TargetKind;
  id: number;
  count: number;
  mine: string | null;
}) {
  const [current, setCurrent] = useState<string | null>(mine);
  const [total, setTotal] = useState(count);
  const [pickerOpen, setPickerOpen] = useState(false);

  const react = async (emoji: string) => {
    setPickerOpen(false);
    const had = current;
    if (had === emoji) {
      setCurrent(null);
      setTotal((t) => Math.max(0, t - 1));
      try {
        await clearReaction(kind, id);
      } catch {
        setCurrent(had);
        setTotal((t) => t + 1);
      }
      return;
    }
    setCurrent(emoji);
    if (!had) setTotal((t) => t + 1);
    try {
      await setReaction(kind, id, emoji);
    } catch {
      setCurrent(had);
      if (!had) setTotal((t) => Math.max(0, t - 1));
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors",
          current
            ? "border-primary/40 bg-primary/10"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
        onClick={() => void react(current ?? "❤️")}
        onMouseEnter={() => setPickerOpen(true)}
        onMouseLeave={() => setPickerOpen(false)}
        aria-label="React"
      >
        <span>{current ?? "❤️"}</span>
        <span>{total}</span>
      </button>
      {pickerOpen && (
        <div
          className="absolute bottom-full left-0 z-10 mb-1 flex gap-1 rounded-full border bg-popover p-1 shadow-md"
          onMouseEnter={() => setPickerOpen(true)}
          onMouseLeave={() => setPickerOpen(false)}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-full p-1 text-lg hover:scale-125"
              onClick={() => void react(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in the browser**

1. Tap the pill → fills with ❤️, count +1; tap again → count back down.
2. Hover → picker shows all 5; picking 💪 swaps the emoji, count unchanged.
3. Reload → state persists (comes from `my_reaction`).
4. Second browser (coach session) reacting → count reflects both after reload.

- [ ] **Step 3: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/components/community/reaction-bar.tsx
git commit -m "feat(community-ui): reaction bar with emoji picker"
```

---

### Task 6: Comments

**Files:**
- Modify: `frontend-customer/src/components/community/comment-section.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `getComments`, `addComment`, `deleteComment` (Task 1); `ReactionBar` (Task 5); `Linkify`, `timeAgo`, `ModeratorHooks` (Task 4).
- Produces: `<CommentSection post me moderator />` — oldest-first flat list with pagination, inline add box, delete-own, per-comment reactions; moderator sees "Remove" on every comment.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addComment, deleteComment, getComments } from "@/lib/community";
import type {
  CommunityComment,
  CommunityMe,
  CommunityPost,
} from "@/types/community";
import { Linkify } from "./linkify";
import { type ModeratorHooks, timeAgo } from "./post-card";
import { ReactionBar } from "./reaction-bar";

export function CommentSection({
  post,
  me,
  moderator,
}: {
  post: CommunityPost;
  me: CommunityMe;
  moderator: ModeratorHooks | null;
}) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (p: number) => {
    const data = await getComments(post.id, p);
    setComments((prev) => (p === 1 ? data.results : [...prev, ...data.results]));
    setHasMore(Boolean(data.next));
    setPage(p);
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const submit = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const comment = await addComment(post.id, draft.trim());
      setComments((prev) => [...prev, comment]);
      setDraft("");
    } catch {
      toast.error("Couldn't add your comment.");
    } finally {
      setBusy(false);
    }
  };

  const removeOwn = async (comment: CommunityComment) => {
    try {
      await deleteComment(comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch {
      toast.error("Couldn't delete the comment.");
    }
  };

  return (
    <div className="space-y-3 border-t pt-3">
      {comments.map((comment) => (
        <div key={comment.id} className="flex items-start gap-2.5">
          <Avatar className="h-7 w-7">
            <AvatarImage src={comment.author.avatar} alt="" />
            <AvatarFallback>
              {comment.author.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">
                {comment.author.display_name}
              </span>
              {comment.author.is_coach && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  Coach
                </Badge>
              )}
              <span className="text-muted-foreground">
                {timeAgo(comment.created_at)}
              </span>
            </div>
            <div className="mt-0.5 text-sm">
              <Linkify text={comment.body} />
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <ReactionBar
                kind="comments"
                id={comment.id}
                count={comment.reaction_count}
                mine={comment.my_reaction}
              />
              {comment.author.id === me.id && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => void removeOwn(comment)}
                  aria-label="Delete comment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {moderator && comment.author.id !== me.id && (
                <button
                  type="button"
                  className="text-xs text-destructive"
                  onClick={() => void moderator.removeComment(comment)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      {hasMore && (
        <Button variant="ghost" size="sm" onClick={() => void load(page + 1)}>
          Show more comments
        </Button>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Write a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={5000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button size="sm" onClick={submit} disabled={busy || !draft.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reply"}
        </Button>
      </div>
    </div>
  );
}
```

(`comment.author.id === me.id` relies on the `me.id` field added in Task 4.)

- [ ] **Step 2: Verify in the browser**

1. Expand 💬 on a post → comment box; write + Enter → appears at bottom, `comment_count` on the card is stale until refetch (acceptable; it updates on next feed load).
2. Delete own comment → disappears.
3. React to a comment with 🎉 → persists on reload.
4. Add 21+ comments via devtools → "Show more comments" pages through.

- [ ] **Step 3: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/components/community/comment-section.tsx
git commit -m "feat(community-ui): inline flat comments"
```

---

### Task 7: Report dialog

**Files:**
- Modify: `frontend-customer/src/components/community/report-dialog.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `reportTarget` (Task 1), `REPORT_REASONS` (types), `ModalPortal`.
- Produces: `<ReportDialog open onClose kind id />`.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Textarea } from "@/components/ui/textarea";
import { reportTarget, type TargetKind } from "@/lib/community";
import { REPORT_REASONS, type ReportReason } from "@/types/community";
import { cn } from "@/lib/utils";

export function ReportDialog({
  open,
  onClose,
  kind,
  id,
}: {
  open: boolean;
  onClose: () => void;
  kind: TargetKind;
  id: number;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await reportTarget(kind, id, reason, detail.trim());
      toast.success("Thanks — a moderator will take a look.");
      onClose();
    } catch {
      toast.error("Couldn't send the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-semibold">Report this {kind === "posts" ? "post" : "comment"}</h3>
          <div className="grid gap-2">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm",
                  reason === r.value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {reason === "other" && (
            <Textarea
              placeholder="Tell us more (optional)"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!reason || busy}>
              Report
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
```

- [ ] **Step 2: Verify in the browser**

1. Report the coach's post as the student → success toast; reporting again → still 204/toast (idempotent).
2. Backend check: `docker compose -p contentor-community-phase-2 -f docker-compose.yml -f docker-compose.worktree.yml exec django python manage.py shell -c "from django_tenants.utils import schema_context;
import django; from apps.community.models import Report
with schema_context('demo_yoga'): print(Report.objects.values('reason','status'))"` → the report row exists. (Check the actual schema name with `Tenant.objects.values('schema_name')` if `demo_yoga` isn't it.)

- [ ] **Step 3: Type-check and commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean.

```bash
git add frontend-customer/src/components/community/report-dialog.tsx
git commit -m "feat(community-ui): report dialog"
```

---

### Task 8: Final verification pass

**Files:** fixes only.

- [ ] **Step 1: Full type-check + production build**

Run: `cd frontend-customer && npx tsc --noEmit && npm run build`
Expected: build succeeds. (Known gotcha: TS 5.9.3 once broke `next build` — the repo pins a working version; do not upgrade TypeScript.)

- [ ] **Step 2: Frontend lint**

Run: `cd frontend-customer && npm run lint`
Expected: no errors in `src/components/community/**` or the touched files.

- [ ] **Step 3: Backend suite still green**

Run: `docker compose -p contentor-community-phase-2 -f docker-compose.yml -f docker-compose.worktree.yml exec django pytest apps/community/tests/ -q`
Expected: 55 passed (54 + the Task 4 `me.id` test).

- [ ] **Step 4: pre-commit**

Run: `pre-commit run --all-files` → all hooks pass.

- [ ] **Step 5: Mobile spot-check**

Devtools responsive mode (390×844): composer, feed cards, image grid, lightbox, comment input all usable; no horizontal scroll.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A frontend-customer/src backend/apps/community
git commit -m "chore(community-ui): phase 2 verification fixes"
```

---

## Out of scope (later phases)

- Coach moderation UI, reports queue, members table, settings tab, superadmin rollup → Phase 3 plan.
- Push notifications, unread dot on the nav link → Phase 4 plan.
- The end-to-end Playwright journey lands in Phase 3 (it exercises both student and coach UIs).
