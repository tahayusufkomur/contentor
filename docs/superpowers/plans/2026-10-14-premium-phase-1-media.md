# Premium look — Phase 1: Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record, photograph, encode and list every picture and clip the new landing reads — the 44 keys of `frontend-main/public/media/media.json` — inside the weight budget, with a typed accessor `media(key)` and a vitest that keeps the budget honest.

**Architecture:** A Playwright script (`scripts/footage/record.ts`, run by e2e's own Playwright through a small config) drives real flows on the running dev stack and writes one webm per flow plus a `marks.json` of named moments and the PNG stills it takes, all under the gitignored `e2e/eval-shots/footage/`. Coach photographs come from Pix4Less through the executor's MCP tools. `scripts/footage/encode.sh` (ffmpeg) cuts the webms on their marks and encodes clips, posters and AVIF stills into `frontend-main/public/media/{clips,posters,stills}`; `scripts/footage/manifest.mjs` probes the files with ffprobe, refuses what the landing would trip on (wrong poster size, a scrub with predicted frames, a file over its target) and writes `media.json`. `frontend-main/src/lib/media.ts` imports that JSON at build time.

**Tech Stack:** Playwright 1.61 (from `e2e/node_modules`, Chromium + its ffmpeg for `recordVideo`), Homebrew ffmpeg 7.1 / ffprobe (libx264, libvpx-vp9, libaom-av1, avif muxer — already on the Mac at `/opt/homebrew/bin`), `jq` (`/usr/bin/jq`), Node 22, vitest 4 in `frontend-main`, the Pix4Less MCP tools (`list_my_images`, `search_images`, `download_image`, `get_pricing`), the dev stack's real AI hub.

**Spec:** `docs/superpowers/specs/2026-10-14-premium-marketing-and-studio-design.md` — section 5.3 (media pipeline), the "1 Media" row of section 6, D3, 5.7 budgets, section 8 risks. Contracts: `docs/superpowers/plans/2026-10-14-premium-phase-0-foundations.md` ("Contracts for later phases": manifest shape, `MediaVideo`) and `docs/superpowers/plans/2026-10-14-premium-phase-2-landing.md` ("Contracts consumed", lines 29–78: the 44 keys, sizes and per-file targets — authoritative).

**Prerequisites:**

- Dev stack up: `make health-check` (if down: `make dev-d`). AI available: `make ai-check`. The agent hub tunnel on `localhost:39300` (read-only GETs only).
- Homebrew ffmpeg present: `which ffmpeg ffprobe` prints `/opt/homebrew/bin/...`. If not: `brew install ffmpeg` (a host tool, not a runtime dependency).
- Playwright browsers: `cd e2e && npm install --silent && npx playwright install chromium ffmpeg`.
- **Studio footage shows the studio as it looks when recorded.** Tasks 4–7 film `frontend-customer` (`/admin`, `/setup`, the student pages). If Phase 4 (studio re-skin) has not merged when you run them, record anyway so Phase 2 can be built, and re-run Tasks 4–7's record and encode steps after Phase 4 merges and before Phase 5 deploys. The file names stay the same, and only Phase 5 deploys, so no published name is ever overwritten. Phase 5 Task 1 Step 3 checks this.
- Cost, said up front: about 80 hub runs on the studio accounts (Task 8 alone ~70: twelve site composes), and 12 Pix4Less searches + 12 downloads. Task 8 Step 1 checks the hub quota first.

## Global Constraints

- Weight budget (spec 5.3): the budget test "fails if the hero clip exceeds 3 MB, any clip 2 MB, the whole folder 35 MB, or a referenced file is missing". Phase 2's per-file targets (hero ≤ 2.5 MB, phone ≤ 1 MB, student clip ≤ 0.6 MB / phone ≤ 0.4 MB, scrubs ≤ 1.5 MB, loops ≤ 0.8 MB, studio stills ≤ 120 KB, coach stills ≤ 160 KB / 60 KB small, look renders ≤ 120 KB / 50 KB small, posters ≤ 120 KB) are enforced by `manifest.mjs`.
- Full scroll (spec 1 and 5.7): "at most 8 MB of media on a full desktop scroll, 4 MB on a phone"; "Media ≤ 8 MB desktop and ≤ 4 MB phone on a full scroll." Phase 2's `landing-media.test.ts` computes it; Task 9 previews it so Phase 1 ships inside.
- Scrubs (spec 8): "All-keyframe clips are larger; they are capped at 2 MB each by shortening them, not by lowering the cap."
- Encodes (spec 5.3): "h264 CRF 23, `maxrate` 2.5 Mbit/s, `-movflags +faststart`; a webm vp9 twin; `-g 1` only for scrub clips; a phone encode at 720 px wide; an AVIF poster from the first frame; a 2x AVIF still per tile." Per-kind maxrates below are that ceiling lowered to Phase 2's targets.
- One heavy job at a time (spec 6, 8): "one heavy job at a time on the VM: recordings and e2e never overlap"; "Recordings, e2e and builds never run together." `record.ts` refuses to start beside another heavy job (Task 4).
- No new runtime dependency (spec D9). ffmpeg is a host tool; `sharp` is not installed in `frontend-main` and is not added.
- Media (spec D3): "real product footage recorded from the running app, plus Pix4Less photography with a person in frame … No stock footage of actors, no invented mockups." Every coach photograph has a person in frame, gender matched to the niche's audience (memory `feedback-curated-photos-human-and-gender-matched`).
- Captions are real text, never baked into video (spec 5.7): no text overlays in any encode.
- Git (spec 5.3): "Media is committed to git up to the 35 MB cap"; no LFS. Commit only the paths each task lists, with `git commit -m … -- <paths>`; never a file you did not change; never switch branches — `git branch --show-current` must print the branch the lead gave you before every commit (the working tree is shared with live sessions). Pre-commit hooks are not installed in this checkout (`.git/hooks` has only post-commit/post-merge); if they are on yours, commit media with `SKIP=check-added-large-files` (its 1 MB default is not our cap; the budget test is).
- Cloudflare: the `contentor.app/media/*` cache rule is Phase 2's (Task 13). It covers everything this plan writes: `/media/clips/*`, `/media/posters/*`, `/media/stills/*`, `/media/media.json`.

## Review Focus

1. **A recording started while e2e, a test suite, a build or another session's `make eval-sites` runs** — the VM swaps, Next 502s and the footage shows blank pages; the recorder must refuse to start. Pinned in Task 4 Step 3 (a fake `vitest` process makes the run fail with "another heavy job is running").
2. **A hub run queued or cancelled mid-take** (every `contentor:compose-*` type runs at `interactive` priority on the hub, so a busy hub queues or cancels page builds and the composer falls back) — the take must fail loudly, never be filmed as a finished site. Pinned by `hubFree()` before every AI flow, the `page_builds.home.status === "ready"` assertion in `setup-compose` (Task 7), `plan_source === "ai"` and home `ready` in each `looks:*` test (Task 8), and the Apply-card assertion in `assistant` (Task 6).
3. **A coach photograph without a person in frame** (an empty studio, a flatlay) or with the wrong gender for the niche — it tells a prospective student "not for you". Pinned by the visual check of every downloaded file (Task 2 Step 5) and by `media-budget.test.ts`'s "every coach photograph names a person" test (Task 1), proven to bite in Task 3 Step 6.
4. **A scrub clip that is not all-keyframe** — every scroll seek decodes from the previous keyframe and the scrub stalls. Pinned by `manifest.mjs`'s keyframe check, proven to bite in Task 9 Step 2.
5. **A poster whose size differs from its clip** (or a tile still whose shape differs from its loop) — the layout jumps when the video replaces the poster (CLS). Pinned by `manifest.mjs`'s poster-size and tile/loop aspect checks, proven to bite in Task 9 Step 2.

## Contracts produced (for Phases 2–5)

- `frontend-main/src/lib/media.ts`: `MediaKind`, `MediaItem` and `media(key: string): MediaItem` exactly as in Phase 2's "Contracts consumed"; `media()` throws `Error('media: unknown key "<key>"')`; the JSON is imported at build time (no `fetch`).
- `frontend-main/public/media/media.json`: `{ "items": { "<key>": MediaItem } }`, 44 keys, in this order: `hero-looks`, `clip-student-phone`, `scrub-setup`, `scrub-assistant`, `loop-{courses,live,messages,community,media,blog,logo}`, `tile-{courses,live,messages,community,media,blog,logo}`, `tile-student-dashboard`, `tile-live-class`, `still-{yoga,fitness,music,dance,cooking,language,martial-arts,crafts,beauty,family,outdoors,wellness}`, `look-{journal,kinetic,encore,studiofloor,tavola,primer,dojo,workshop,atelier,sprout,trail,nocturne}`.
- Sizes: `hero-looks` 1600×1000, 12 s (`webm`, `phoneSrc` 720×450, poster); `clip-student-phone` 750×1624, ≤ 8 s (`webm`, `phoneSrc` 720 wide, poster); scrubs 1280×800, all-keyframe, 10 fps (poster, no `webm`/`phoneSrc`); loops 1280×800, ≤ 3.8 s (`webm`, poster); `tile-*` 1600×1000 (`srcSmall` 800×500); `still-*` 1280×1600 (`srcSmall` 640×800, `alt`, `license`); `look-*` 750×1624 (`srcSmall` 375×812, `alt`). Every `srcSmall` is exactly half the width of its `src`: Phases 2 and 3 write `srcSet` as `${srcSmall} ${width / 2}w, ${src} ${width}w`, and `manifest.mjs` fails on any other twin.
- File names: `/media/clips/<key>.mp4`, `/media/clips/<key>.webm`, `/media/clips/<key>-phone.mp4`, `/media/posters/<key>.avif`, `/media/stills/<key>.avif`, `/media/stills/<key>-small.avif`.

## Out of scope (no consumer in Phases 2–4)

Image-to-video loops from Pix4Less photos and 16:9 banners (spec 5.3) — Phase 2's seven `loop-*` keys are studio screen loops cut from the recordings. A recording of the studio Overview (spec 5.3 flow list) — no key reads it.

## Files

- Create `frontend-main/src/lib/media.ts` — the typed accessor.
- Create `frontend-main/src/lib/__tests__/media-budget.test.ts` — the budget test.
- Create `frontend-main/public/media/media.json` — written by hand empty in Task 1, then only by `manifest.mjs`.
- Create `scripts/footage/stills.json` — alt text and licence per still (the only hand-edited metadata).
- Create `scripts/footage/footage.config.ts` — Playwright config for the recorder.
- Create `scripts/footage/record.ts` — the flows (grows one block per task, Tasks 4–8).
- Create `scripts/footage/encode.sh` — ffmpeg cuts and encodes, by group.
- Create `scripts/footage/manifest.mjs` — probes, checks, writes `media.json`.
- Generated, gitignored: `e2e/eval-shots/footage/` (raw webms, marks, PNGs, photos, review sheets).
- Generated, committed: `frontend-main/public/media/{clips,posters,stills}/*`.

---

### Task 1: The accessor and the budget test

**Files:**

- Create: `frontend-main/src/lib/media.ts`
- Create: `frontend-main/public/media/media.json`
- Test: `frontend-main/src/lib/__tests__/media-budget.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `export type MediaKind = "clip" | "scrub" | "loop" | "still"`; `export interface MediaItem { kind; src; width; height; bytes; poster?; webm?; phoneSrc?; durationS?; srcSmall?; alt?; license? }`; `export function media(key: string): MediaItem` (throws `Error('media: unknown key "<key>"')`). The test reads `public/media/media.json` and the files it names; every later task re-runs it.

- [ ] **Step 1: Write the failing test**

```ts
// frontend-main/src/lib/__tests__/media-budget.test.ts
// Holds public/media honest (spec 5.3): every file media.json names exists and
// is the size it claims, the hero clip stays ≤ 3 MB and every other clip
// ≤ 2 MB, the folder ≤ 35 MB, and every coach photograph shows a person.
// Phase 2's landing-media.test.ts adds the full-scroll sums; not repeated here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { media, type MediaItem } from "@/lib/media";

const PUBLIC = path.resolve(__dirname, "../../../public");
const DIR = path.join(PUBLIC, "media");
const { items } = JSON.parse(
  readFileSync(path.join(DIR, "media.json"), "utf8"),
) as {
  items: Record<string, MediaItem>;
};
const entries = Object.entries(items);
const MB = 1_000_000; // decimal: the stricter reading (Phase 5 checks with 2000000)
const onDisk = (p: string) => path.join(PUBLIC, p.replace(/^\//, ""));
const files = (m: MediaItem) =>
  [m.src, m.webm, m.phoneSrc, m.poster, m.srcSmall].filter((p): p is string =>
    Boolean(p),
  );
const videos = (m: MediaItem) =>
  [m.src, m.webm, m.phoneSrc].filter((p): p is string => Boolean(p));
const du = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (sum, e) =>
      sum +
      (e.isDirectory()
        ? du(path.join(dir, e.name))
        : statSync(path.join(dir, e.name)).size),
    0,
  );
// A coach photograph's alt is its Pix4Less description: it must name the person in frame.
const PERSON =
  /\b(woman|women|man|men|teacher|instructor|coach|tutor|student|students|dancer|chef|cook|musician|guitarist|pianist|singer|potter|artist|mother|father|parent|child|girl|boy|hiker|guide|person|people|she|he|her|his)\b/i;

describe("media()", () => {
  it("throws on a key the manifest does not have", () => {
    expect(() => media("no-such-key")).toThrow(
      'media: unknown key "no-such-key"',
    );
  });
  it("does not answer for Object.prototype names", () => {
    expect(() => media("constructor")).toThrow(/unknown key/);
  });
  it.runIf(entries.length > 0)("returns the manifest entry", () => {
    const [key, item] = entries[0];
    expect(media(key)).toEqual(item);
  });
});

describe("media budget (spec 5.3)", () => {
  it("every file media.json names exists, and bytes is the src's size", () => {
    for (const [key, item] of entries) {
      for (const p of files(item))
        expect(() => statSync(onDisk(p)), `${key}: ${p}`).not.toThrow();
      expect(item.bytes, key).toBe(statSync(onDisk(item.src)).size);
    }
  });
  it("the hero clip ≤ 3 MB and every other clip ≤ 2 MB, each encode", () => {
    for (const [key, item] of entries) {
      if (item.kind === "still") continue;
      const cap = key === "hero-looks" ? 3 * MB : 2 * MB;
      for (const p of videos(item))
        expect(statSync(onDisk(p)).size, p).toBeLessThanOrEqual(cap);
    }
  });
  it("public/media ≤ 35 MB", () => {
    const total = du(DIR);
    expect(total / MB, `${(total / MB).toFixed(1)} MB`).toBeLessThanOrEqual(35);
  });
  it("every coach photograph names a person and carries its licence", () => {
    for (const [key, item] of entries.filter(([k]) => k.startsWith("still-"))) {
      expect(
        item.alt ?? "",
        `${key}: alt must name the person in frame`,
      ).toMatch(PERSON);
      expect(item.license, `${key}: license`).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts`
Expected: FAIL — `ENOENT … public/media/media.json` (or cannot resolve `@/lib/media`).

- [ ] **Step 3: Write the accessor and the empty manifest**

```json
{
  "items": {}
}
```

Save that as `frontend-main/public/media/media.json` (from now on only `manifest.mjs` writes it).

```ts
// frontend-main/src/lib/media.ts
// The landing's footage and photography, as listed in public/media/media.json
// (written by scripts/footage/manifest.mjs; spec 5.3). Imported at build time,
// never fetched. Read it from server components: a client import would ship
// the whole manifest to the browser.
import manifest from "../../public/media/media.json";

export type MediaKind = "clip" | "scrub" | "loop" | "still";

export interface MediaItem {
  kind: MediaKind;
  src: string; // "/media/clips/hero-looks.mp4" | "/media/stills/still-yoga.avif"
  width: number;
  height: number;
  bytes: number;
  poster?: string; // every clip | scrub | loop
  webm?: string; // clips and loops
  phoneSrc?: string; // 720 px encode; hero and the student clip
  durationS?: number;
  srcSmall?: string; // every still: the small AVIF
  alt?: string; // every still
  license?: string; // coach photographs
}

const ITEMS = (manifest as unknown as { items: Record<string, MediaItem> })
  .items;

/** One manifest entry. Throws on a key media.json does not have, so a renamed
 * or missing recording fails the render instead of leaving a blank tile. */
export function media(key: string): MediaItem {
  if (!Object.hasOwn(ITEMS, key))
    throw new Error(`media: unknown key "${key}"`);
  return ITEMS[key];
}
```

- [ ] **Step 4: Run the test, typecheck and format**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts && npx prettier --check src/lib/media.ts src/lib/__tests__/media-budget.test.ts public/media/media.json && npx eslint src/lib/media.ts src/lib/__tests__/media-budget.test.ts`
Expected: 6 passed, 1 skipped (`returns the manifest entry` waits for a non-empty manifest); prettier and eslint clean.
Then (no other heavy job running): `make typecheck` — expected: both apps clean.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add frontend-main/src/lib/media.ts frontend-main/src/lib/__tests__/media-budget.test.ts frontend-main/public/media/media.json
git commit -m "feat(media): typed media() accessor and the media budget test" -- frontend-main/src/lib/media.ts frontend-main/src/lib/__tests__/media-budget.test.ts frontend-main/public/media/media.json
```

---

### Task 2: Coach photography from Pix4Less

**Files:**

- Create: `scripts/footage/stills.json`
- Generated (gitignored): `e2e/eval-shots/footage/photos/<niche>.{jpg,png,webp,avif}`

**Interfaces:**

- Consumes: the Pix4Less MCP tools of your session.
- Produces: `scripts/footage/stills.json` — `{ "<key>": { "alt": string, "license"?: string, "pix4lessId"?: string } }` for all 33 still keys (`tile-*`, `look-*`, `still-*`); twelve photo files named by niche (`yoga`, `fitness`, `music`, `dance`, `cooking`, `language`, `martial-arts`, `crafts`, `beauty`, `family`, `outdoors`, `wellness`).

- [ ] **Step 1: Write `stills.json` with the alt text known now**

```json
{
  "tile-courses": {
    "alt": "The Courses page of a coach's studio, listing her yoga courses"
  },
  "tile-live": {
    "alt": "The Live page of the studio, with upcoming classes and a line to describe a new one"
  },
  "tile-messages": {
    "alt": "The studio inbox, with the coach's mail folders and conversations"
  },
  "tile-community": {
    "alt": "The community page of the studio, with students' posts and replies"
  },
  "tile-media": {
    "alt": "The studio's media library: the coach's photos and videos in a grid"
  },
  "tile-blog": {
    "alt": "The studio's blog page, with drafted and published posts"
  },
  "tile-logo": {
    "alt": "Logo Studio over the coach's site, with logo ideas for her brand"
  },
  "tile-student-dashboard": {
    "alt": "A student's dashboard on the coach's site, with her courses and progress"
  },
  "tile-live-class": {
    "alt": "The student's live classes page, with a class live now and a Join button"
  },
  "look-journal": {
    "alt": "The Quiet Journal look on a phone: the home page of Mara Lindqvist, a yoga teacher"
  },
  "look-kinetic": {
    "alt": "The Kinetic Club look on a phone: the home page of Iron & Oak Strength"
  },
  "look-encore": {
    "alt": "The Encore look on a phone: the home page of Theo Okafor, a music teacher"
  },
  "look-studiofloor": {
    "alt": "The Studio Floor look on a phone: the home page of Saffron Belly Dance"
  },
  "look-tavola": {
    "alt": "The Tavola look on a phone: the home page of The Weeknight Kitchen"
  },
  "look-primer": {
    "alt": "The Primer look on a phone: the home page of Lucía Ferrer, a language tutor"
  },
  "look-dojo": {
    "alt": "The Dojo look on a phone: the home page of Kenji Mori Karate"
  },
  "look-workshop": {
    "alt": "The Workshop look on a phone: the home page of Studio Ochre, a painting teacher"
  },
  "look-atelier": {
    "alt": "The Atelier look on a phone: the home page of Elif Aydın Makeup"
  },
  "look-sprout": {
    "alt": "The Sprout look on a phone: the home page of Kind Mornings, a family coach"
  },
  "look-trail": {
    "alt": "The Trail look on a phone: the home page of Ridge & Pine Guiding"
  },
  "look-nocturne": {
    "alt": "The Nocturne look on a phone: the home page of Quiet Hours, a wellness coach"
  }
}
```

(Look labels are each style's `label` in `packages/shared/src/sections/styles/<id>.json`; the brands are the site-eval briefs Task 8 composes. Tasks 4, 5 and 8 re-read each alt against the still and correct it if the screen differs.)

- [ ] **Step 2: Check credits and what the account already owns**

Call `get_pricing` (free) and note search and download credits. For each niche, call `list_my_images` with `q` set to the niche word (`yoga`, `strength`, `guitar`, `dance`, `cooking`, `language`, `karate`, `pottery`, `makeup`, `family`, `hiking`, `meditation`), `limit: 20`, `include_previews: true`. An owned image that fits the row below re-downloads free: use it instead of searching.

- [ ] **Step 3: Search and pick, one niche at a time**

For each row call `search_images` with `query` = the row's description, `aspect_ratio: "4:5"`, `orientation: "portrait"`, `min_height: 1600`, `include_previews: true`, `per_page: 12`. Look at every preview. Pick the one where the named person is clearly in frame, doing the thing, face or hands visible, gender as in the row (women-focused niches: women; mixed niches carry both across the set). Never an empty room, gear on a floor or a flatlay. If none fits, call again with the result's `session_id` (next unseen matches); if still none, rephrase once with a different setting.

| Key                  | Person (audience) | `query`                                                                                                   |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `still-yoga`         | woman             | a female yoga teacher guiding a student into a gentle seated twist in a sunlit studio with a wooden floor |
| `still-fitness`      | man               | a male strength coach spotting a client during a goblet squat in a bright gym                             |
| `still-music`        | woman             | a woman teaching guitar to an adult student at home, both smiling, warm window light                      |
| `still-dance`        | woman             | a female dance teacher demonstrating a turn in a mirrored dance studio, mid-movement                      |
| `still-cooking`      | man               | a male cooking teacher showing how to chop fresh herbs at a home kitchen counter                          |
| `still-language`     | woman             | a woman language tutor talking with a student over coffee at a table with open notebooks                  |
| `still-martial-arts` | man               | a male karate instructor correcting a student's stance in a dojo with tatami mats                         |
| `still-crafts`       | woman             | a woman potter shaping clay on a pottery wheel, her face and hands in frame, soft studio light            |
| `still-beauty`       | woman             | a female makeup artist applying makeup to a client's face in a bright beauty studio                       |
| `still-family`       | woman with child  | a mother reading a picture book with her young child on a sofa in soft daylight                           |
| `still-outdoors`     | man               | a male hiking guide pointing out the trail to a small group on a mountain ridge                           |
| `still-wellness`     | woman             | a woman meditating cross-legged by a window at dawn, eyes closed, calm warm light                         |

- [ ] **Step 4: Download each pick and record it**

For each pick call `download_image` with its `id` (charged once; owned images are free) and fetch the signed URL right away (it expires; never paste it into a file):

```bash
fetch_photo() { # fetch_photo <niche> <signed url>
  local dir=e2e/eval-shots/footage/photos ct e
  mkdir -p "$dir"
  ct=$(curl -sSfL -o "$dir/$1.tmp" -w '%{content_type}' "$2")
  case $ct in
    image/jpeg*) e=jpg ;; image/png*) e=png ;; image/webp*) e=webp ;; image/avif*) e=avif ;;
    *) echo "unexpected content type $ct" >&2; return 1 ;;
  esac
  rm -f "$dir/$1".jpg "$dir/$1".png "$dir/$1".webp "$dir/$1".avif
  mv "$dir/$1.tmp" "$dir/$1.$e"
}
fetch_photo yoga 'PASTE-THE-SIGNED-URL'   # then fitness, music, … martial-arts, … wellness
```

Then write its entry: `alt` is the image's Pix4Less `description` (the tool's own advice: use it as alt text); `license` is the result's `license` value (its `name` field if it is an object); `pix4lessId` its `id`:

```bash
add_still() { # add_still <key> <id> <alt> <license>
  local t; t=$(mktemp)
  jq --arg k "$1" --arg id "$2" --arg alt "$3" --arg lic "$4" \
    '.[$k] = {pix4lessId: $id, alt: $alt, license: $lic}' scripts/footage/stills.json > "$t"
  mv "$t" scripts/footage/stills.json
}
add_still still-yoga 'THE-ID' 'THE-DESCRIPTION' 'THE-LICENSE'   # once per pick
```

- [ ] **Step 5: Look at every photo (Review Focus 3)**

```bash
mkdir -p e2e/eval-shots/footage/review
for f in e2e/eval-shots/footage/photos/*.*; do
  ffmpeg -y -hide_banner -loglevel error -i "$f" -vf "scale=-2:900" -frames:v 1 "e2e/eval-shots/footage/review/photo-$(basename "${f%.*}").jpg"
done
jq -r 'to_entries[] | select(.key|startswith("still-")) | "\(.key)\t\(.value.alt)"' scripts/footage/stills.json
```

Read all twelve `review/photo-*.jpg` images (not a sample). Each must show the row's person, in the row's gender, doing the niche's activity; each alt line must name that person (`woman`, `teacher`, `her`, …). Replace any that fail (back to Step 3 for that row).
Expected: 12 photos, 12 `still-*` entries, every one a person; `jq 'keys|length' scripts/footage/stills.json` prints `33`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add scripts/footage/stills.json
git commit -m "feat(media): coach photography picks and alt text for every still" -- scripts/footage/stills.json
```

---

### Task 3: `encode.sh` and `manifest.mjs`, shipped with the coach stills

**Files:**

- Create: `scripts/footage/encode.sh`
- Create: `scripts/footage/manifest.mjs`
- Modify (generated): `frontend-main/public/media/media.json`, `frontend-main/public/media/stills/still-*.avif`

**Interfaces:**

- Consumes: `e2e/eval-shots/footage/` (photos now; webms, `<flow>.marks.json` and PNGs from Tasks 4–8 — flow and mark names listed in each group function below), `scripts/footage/stills.json` (Task 2).
- Produces: `scripts/footage/encode.sh <group>…` with groups `photos student studio assistant setup looks all`; a group whose raw input is missing prints `skip …` and moves on. `node scripts/footage/manifest.mjs [--partial]` (env `MEDIA_DIR` to point it at a copy). Phase 3 can start its login photograph once this task lands (`still-yoga` is in the manifest).

- [ ] **Step 1: Write `encode.sh`**

```bash
#!/usr/bin/env bash
# Encode the landing's media from the raw footage and photos.
#
#   scripts/footage/encode.sh <group>...   groups: photos student studio assistant setup looks all
#
# Reads e2e/eval-shots/footage/ (record.ts's <flow>.webm + <flow>.marks.json +
# PNG stills; photos/<niche>.* from Pix4Less) and writes
# frontend-main/public/media/{clips,posters,stills}. Then run
# `node scripts/footage/manifest.mjs`.
# Spec 5.3: h264 CRF 23 with maxrate ≤ 2.5 Mbit/s and +faststart, a VP9 twin,
# -g 1 only for scrubs, a 720 px phone encode, AVIF posters from the first
# frame, 2x AVIF stills. Each maxrate below is that ceiling lowered to Phase 2's
# per-file target: target bytes × 8 / clip seconds (hero 2.5 MB / 12 s ≈ 1.6M).
# macOS /bin/bash is 3.2: no associative arrays.
set -euo pipefail
export LC_ALL=C # awk prints "2.50", never "2,50"
cd "$(dirname "$0")/../.."
RAW=e2e/eval-shots/footage
OUT=frontend-main/public/media
# Scrubs are all-keyframe, so every frame costs a whole picture. Over 1.5 MB:
# raise SCRUB_SPEED (fewer frames, same story) before SCRUB_CRF (28 at most).
SCRUB_FPS=${SCRUB_FPS:-10}
SCRUB_SPEED=${SCRUB_SPEED:-2.5}
SCRUB_CRF=${SCRUB_CRF:-26}
HERO_LOOKS="journal tavola encore kinetic"
LOOKS="journal kinetic encore studiofloor tavola primer dojo workshop atelier sprout trail nocturne"
NICHES="yoga fitness music dance cooking language martial-arts crafts beauty family outdoors wellness"

for tool in ffmpeg ffprobe jq; do
  command -v "$tool" >/dev/null || { echo "missing $tool: brew install ffmpeg jq" >&2; exit 1; }
done
mkdir -p "$OUT/clips" "$OUT/posters" "$OUT/stills"

q() { ffmpeg -y -hide_banner -loglevel error "$@"; }
kb() { echo $(($(wc -c <"$1") / 1000)); }

# mark <flow> <name>: seconds from the flow's first frame (record.ts).
mark() { jq -er --arg k "$2" '.[$k]' "$RAW/$1.marks.json" || { echo "no mark $2 in $1.marks.json: re-record $1" >&2; return 1; }; }

# segments <key> <kind> <flow:fromMark:toMark>...: the segments joined into clips/<key>.mp4.
#   scrub: all-keyframe, sped up by SCRUB_SPEED;  loop: sped up to fit 3.8 s;  phone: 750×1624.
segments() {
  local key=$1 kind=$2
  shift 2
  local inputs=() total=0 n=0 i seg flow from to s e len speed vf x264 filt=""
  for seg in "$@"; do
    IFS=: read -r flow from to <<<"$seg"
    [ -f "$RAW/$flow.webm" ] || { echo "skip $key: no $flow.webm (record it first)"; return 0; }
    s=$(mark "$flow" "$from")
    e=$(mark "$flow" "$to")
    len=$(awk -v a="$s" -v b="$e" 'BEGIN{printf "%.2f", b-a}')
    inputs+=(-ss "$s" -t "$len" -i "$RAW/$flow.webm")
    total=$(awk -v a="$total" -v b="$len" 'BEGIN{printf "%.2f", a+b}')
    n=$((n + 1))
  done
  case $kind in
    scrub)
      speed=$SCRUB_SPEED
      vf="fps=$SCRUB_FPS,scale=1280:800:flags=lanczos"
      x264="-preset slow -crf $SCRUB_CRF -g 1 -keyint_min 1 -sc_threshold 0 -bf 0" ;;
    loop)
      speed=$(awk -v t="$total" 'BEGIN{printf "%.3f", (t > 3.8 ? t / 3.8 : 1)}')
      vf="fps=25,scale=1280:800:flags=lanczos"
      x264="-preset slow -crf 23 -maxrate 1.5M -bufsize 3M" ;;
    phone)
      speed=1
      vf="fps=25,scale=750:1624:flags=lanczos"
      x264="-preset slow -crf 23 -maxrate 0.6M -bufsize 1.2M" ;;
  esac
  i=0
  while [ $i -lt $n ]; do filt="$filt[$i:v]setpts=(PTS-STARTPTS)/$speed,$vf,setsar=1[s$i];"; i=$((i + 1)); done
  i=0
  while [ $i -lt $n ]; do filt="$filt[s$i]"; i=$((i + 1)); done
  filt="${filt}concat=n=$n:v=1:a=0[v]"
  # shellcheck disable=SC2086 # $x264 is a word list on purpose
  q "${inputs[@]}" -filter_complex "$filt" -map "[v]" -an -c:v libx264 $x264 \
    -pix_fmt yuv420p -movflags +faststart "$OUT/clips/$key.mp4"
  echo "clip  $key  $(kb "$OUT/clips/$key.mp4") KB  (${total}s raw, speed $speed)"
}

# webm <key> <crf> <cap>: the VP9 twin; manifest.mjs fails it if it is bigger than the mp4.
webm() { q -i "$OUT/clips/$1.mp4" -an -c:v libvpx-vp9 -crf "$2" -b:v "$3" -row-mt 1 -deadline good -cpu-used 2 "$OUT/clips/$1.webm"; }
# phone <key> <maxrate>: the 720 px wide encode MediaVideo serves below 768 px.
phone() {
  q -i "$OUT/clips/$1.mp4" -an -vf "scale=720:-2:flags=lanczos" -c:v libx264 -preset slow -crf 23 \
    -maxrate "$2" -bufsize "$2" -pix_fmt yuv420p -movflags +faststart "$OUT/clips/$1-phone.mp4"
}
# poster <key>: the clip's first frame as AVIF, at the clip's own size (no layout shift).
poster() { q -i "$OUT/clips/$1.mp4" -frames:v 1 -c:v libaom-av1 -still-picture 1 -crf 32 -cpu-used 4 -pix_fmt yuv420p "$OUT/posters/$1.avif"; }
# avif <in> <out> <w:h> <crf>: a still, scaled to cover the box and center-cropped.
avif() {
  q -i "$1" -vf "scale=$3:force_original_aspect_ratio=increase:flags=lanczos,crop=$3" -frames:v 1 \
    -c:v libaom-av1 -still-picture 1 -crf "$4" -cpu-used 4 -pix_fmt yuv420p "$2"
}
# still <key> <in> <w:h> <small w:h> <crf> <small crf>
still() {
  [ -f "$2" ] || { echo "skip $1: no ${2:-photo} (record or download it first)"; return 0; }
  avif "$2" "$OUT/stills/$1.avif" "$3" "$5"
  avif "$2" "$OUT/stills/$1-small.avif" "$4" "$6"
  echo "still $1  $(kb "$OUT/stills/$1.avif") KB / $(kb "$OUT/stills/$1-small.avif") KB"
}
# loop <key> <flow:from:to>: a studio tile's hover loop with its twin and poster.
loop() {
  segments "$1" loop "$2"
  if [ -f "$OUT/clips/$1.mp4" ]; then webm "$1" 36 1.2M; poster "$1"; fi
}

photos() {
  local n
  for n in $NICHES; do still "still-$n" "$(ls "$RAW"/photos/"$n".* 2>/dev/null | head -1)" 1280:1600 640:800 36 38; done
}
student() {
  segments clip-student-phone phone student-phone:dash:dash-tap student-phone:lesson:lesson-end student-phone:live:live-tap
  if [ -f "$OUT/clips/clip-student-phone.mp4" ]; then
    webm clip-student-phone 34 0.6M
    phone clip-student-phone 0.4M
    poster clip-student-phone
  fi
  still tile-student-dashboard "$RAW/tile-student-dashboard.png" 1600:1000 800:500 28 32
  still tile-live-class "$RAW/tile-live-class.png" 1600:1000 800:500 28 32
}
studio() {
  local t
  for t in courses messages community media blog logo; do loop "loop-$t" "studio-tiles:$t-start:$t-end"; done
  loop loop-live studio-live:form:created
  for t in courses live messages community media blog logo; do still "tile-$t" "$RAW/tile-$t.png" 1600:1000 800:500 28 32; done
}
assistant() {
  segments scrub-assistant scrub assistant:start:drafting assistant:card:end
  if [ -f "$OUT/clips/scrub-assistant.mp4" ]; then poster scrub-assistant; fi
}
setup() {
  segments scrub-setup scrub setup-answer:ask-1:sent setup-answer:ask-2:picked setup-looks:gallery:kept \
    setup-compose:composing:composing-held setup-compose:built:scrolled
  if [ -f "$OUT/clips/scrub-setup.mp4" ]; then poster scrub-setup; fi
}
# hero: four looks × 3 s from the "scroll" mark, the phone cut laid over the desktop cut.
hero() {
  local inputs=() filt="" i=0 l f s
  for l in $HERO_LOOKS; do
    for f in "site-$l" "site-$l-phone"; do
      [ -f "$RAW/$f.webm" ] || { echo "skip hero-looks: no $f.webm (record looks:$l first)"; return 0; }
    done
    s=$(mark "site-$l" scroll)
    inputs+=(-ss "$s" -t 3 -i "$RAW/site-$l.webm")
    s=$(mark "site-$l-phone" scroll)
    inputs+=(-ss "$s" -t 3 -i "$RAW/site-$l-phone.webm")
    filt="$filt[$((2 * i)):v]setpts=PTS-STARTPTS,fps=25,scale=1600:1000:flags=lanczos,setsar=1[d$i];"
    # ponytail: square ink frame round the phone; rounded corners need an alpha mask, add if the owner asks
    filt="$filt[$((2 * i + 1)):v]setpts=PTS-STARTPTS,fps=25,scale=-2:820:flags=lanczos,pad=iw+16:ih+16:8:8:color=0x1d1d1f,setsar=1[p$i];"
    filt="$filt[d$i][p$i]overlay=x=W-w-72:y=H-h-48:shortest=1[h$i];"
    i=$((i + 1))
  done
  filt="$filt[h0][h1][h2][h3]concat=n=4:v=1:a=0[v]"
  q "${inputs[@]}" -filter_complex "$filt" -map "[v]" -an -c:v libx264 -preset slow -crf 23 \
    -maxrate 1.6M -bufsize 3.2M -pix_fmt yuv420p -movflags +faststart "$OUT/clips/hero-looks.mp4"
  webm hero-looks 34 1.6M
  phone hero-looks 0.6M
  poster hero-looks
  echo "clip  hero-looks  $(kb "$OUT/clips/hero-looks.mp4") KB"
}
looks() {
  local l
  hero
  for l in $LOOKS; do still "look-$l" "$RAW/look-$l.png" 750:1624 375:812 30 32; done
}

[ $# -gt 0 ] || { echo "usage: $0 photos|student|studio|assistant|setup|looks|all ..." >&2; exit 1; }
for g in "$@"; do
  case $g in
    all) photos; student; studio; assistant; setup; looks ;;
    photos | student | studio | assistant | setup | looks) "$g" ;;
    *) echo "unknown group: $g" >&2; exit 1 ;;
  esac
done
```

Run: `chmod +x scripts/footage/encode.sh && bash -n scripts/footage/encode.sh`
Expected: no output (syntax OK).

- [ ] **Step 2: Write `manifest.mjs`**

```js
#!/usr/bin/env node
// Writes frontend-main/public/media/media.json from the files encode.sh wrote
// and scripts/footage/stills.json, after checking what the landing would trip
// on. Run from the repo root:
//   node scripts/footage/manifest.mjs [--partial]
// --partial leaves out keys whose main file is not encoded yet (so stills can
// ship before the footage); the final run has no flag and needs all 44 keys.
// MEDIA_DIR points it at a copy of public/media (Task 9's negative check).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const PUBLIC = "frontend-main/public";
const DIR = process.env.MEDIA_DIR ?? path.join(PUBLIC, "media");
const partial = process.argv.includes("--partial");
const META = JSON.parse(readFileSync("scripts/footage/stills.json", "utf8"));

const TILES = [
  "courses",
  "live",
  "messages",
  "community",
  "media",
  "blog",
  "logo",
];
const NICHES = [
  "yoga",
  "fitness",
  "music",
  "dance",
  "cooking",
  "language",
  "martial-arts",
  "crafts",
  "beauty",
  "family",
  "outdoors",
  "wellness",
];
const LOOKS = [
  "journal",
  "kinetic",
  "encore",
  "studiofloor",
  "tavola",
  "primer",
  "dojo",
  "workshop",
  "atelier",
  "sprout",
  "trail",
  "nocturne",
];
// The 44 keys Phase 2 reads (docs/superpowers/plans/2026-10-14-premium-phase-2-landing.md, "Contracts consumed").
const KEYS = [
  "hero-looks",
  "clip-student-phone",
  "scrub-setup",
  "scrub-assistant",
  ...TILES.map((t) => `loop-${t}`),
  ...TILES.map((t) => `tile-${t}`),
  "tile-student-dashboard",
  "tile-live-class",
  ...NICHES.map((n) => `still-${n}`),
  ...LOOKS.map((l) => `look-${l}`),
];

const K = 1000;
const M = 1000 * K;
/** Phase 2's per-file targets, in bytes. */
function targets(key) {
  if (key === "hero-looks")
    return { src: 2.5 * M, webm: 2.5 * M, phoneSrc: 1 * M, poster: 120 * K };
  if (key === "clip-student-phone")
    return { src: 0.6 * M, webm: 0.6 * M, phoneSrc: 0.4 * M, poster: 120 * K };
  if (key.startsWith("scrub-")) return { src: 1.5 * M, poster: 120 * K };
  if (key.startsWith("loop-"))
    return { src: 0.8 * M, webm: 0.8 * M, poster: 120 * K };
  if (key.startsWith("still-")) return { src: 160 * K, srcSmall: 60 * K };
  if (key.startsWith("look-")) return { src: 120 * K, srcSmall: 50 * K };
  return { src: 120 * K }; // tile-*
}
const kindOf = (key) =>
  key === "hero-looks" || key.startsWith("clip-")
    ? "clip"
    : key.startsWith("scrub-")
      ? "scrub"
      : key.startsWith("loop-")
        ? "loop"
        : "still";

const ffprobe = (file, entries) =>
  JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        entries,
        "-of",
        "json",
        file,
      ],
      {
        encoding: "utf8",
        maxBuffer: 64 * M,
      },
    ),
  );
const dims = (file) => {
  const s = ffprobe(file, "stream=width,height").streams[0];
  return { width: s.width, height: s.height };
};
const seconds = (file) =>
  Math.round(Number(ffprobe(file, "format=duration").format.duration) * 10) /
  10;
const allKeyframes = (file) =>
  ffprobe(file, "frame=key_frame").frames.every((f) => f.key_frame === 1);
const url = (file) =>
  "/" + path.relative(PUBLIC, file).split(path.sep).join("/");

const errors = [];
const rows = [];
const items = {};
for (const key of KEYS) {
  const kind = kindOf(key);
  const f =
    kind === "still"
      ? {
          src: `${DIR}/stills/${key}.avif`,
          srcSmall: `${DIR}/stills/${key}-small.avif`,
        }
      : {
          src: `${DIR}/clips/${key}.mp4`,
          webm: `${DIR}/clips/${key}.webm`,
          phoneSrc: `${DIR}/clips/${key}-phone.mp4`,
          poster: `${DIR}/posters/${key}.avif`,
        };
  if (!existsSync(f.src)) {
    if (!partial)
      errors.push(`${key}: ${f.src} is missing (scripts/footage/encode.sh)`);
    continue;
  }
  for (const [field, file] of Object.entries(f))
    if (!existsSync(file)) delete f[field];

  const item = {
    kind,
    src: url(f.src),
    ...dims(f.src),
    bytes: statSync(f.src).size,
  };
  if (kind === "still") {
    const meta = META[key] ?? {};
    if (!meta.alt) errors.push(`${key}: no alt in scripts/footage/stills.json`);
    else item.alt = meta.alt;
    if (key.startsWith("still-") && !meta.license)
      errors.push(`${key}: no license in scripts/footage/stills.json`);
    if (meta.license) item.license = meta.license;
    if (f.srcSmall) {
      item.srcSmall = url(f.srcSmall);
      // Phases 2–3 build srcSet as `${srcSmall} ${width / 2}w`: the twin must be exactly half.
      const s = dims(f.srcSmall);
      if (s.width * 2 !== item.width)
        errors.push(`${key}: small twin ${s.width} px ≠ half of ${item.width}`);
    } else errors.push(`${key}: no small twin`);
  } else {
    if (!f.poster) errors.push(`${key}: no poster`);
    else {
      item.poster = url(f.poster);
      // Review Focus 5: a poster of another size shifts the layout when the video takes over.
      const p = dims(f.poster);
      if (p.width !== item.width || p.height !== item.height)
        errors.push(
          `${key}: poster ${p.width}×${p.height} ≠ clip ${item.width}×${item.height}`,
        );
    }
    if (f.webm) {
      item.webm = url(f.webm);
      // Desktop Chrome plays the webm (MediaVideo lists it first) while Phase 2 sums the mp4.
      if (statSync(f.webm).size > item.bytes)
        errors.push(
          `${key}: webm bigger than the mp4: raise its VP9 -crf in encode.sh`,
        );
    }
    if (f.phoneSrc) item.phoneSrc = url(f.phoneSrc);
    item.durationS = seconds(f.src);
    // Review Focus 4: a scrub with predicted frames stalls on every seek.
    if (kind === "scrub" && !allKeyframes(f.src))
      errors.push(`${key}: not all-keyframe: encode.sh must pass -g 1`);
  }
  for (const [field, max] of Object.entries(targets(key))) {
    if (!f[field]) continue;
    const bytes = statSync(f[field]).size;
    rows.push(
      `${bytes > max ? "OVER" : "ok  "}  ${key}.${field}  ${Math.round(bytes / K)} KB / ${Math.round(max / K)} KB`,
    );
    if (bytes > max)
      errors.push(
        `${key}.${field}: ${Math.round(bytes / K)} KB, over the ${Math.round(max / K)} KB target`,
      );
  }
  items[key] = item;
}
// A studio tile's still is its loop's poster on the landing (Phase 2 Task 7): same shape.
for (const t of TILES) {
  const a = items[`tile-${t}`];
  const b = items[`loop-${t}`];
  if (a && b && Math.abs(a.width / a.height - b.width / b.height) > 0.01)
    errors.push(
      `tile-${t} ${a.width}×${a.height} and loop-${t} ${b.width}×${b.height} differ in shape`,
    );
}

console.log(rows.join("\n"));
if (errors.length) {
  console.error(
    `\n${errors.length} problem(s), media.json not written:\n- ${errors.join("\n- ")}`,
  );
  process.exit(1);
}
writeFileSync(
  path.join(DIR, "media.json"),
  JSON.stringify({ items }, null, 2) + "\n",
);
console.log(
  `\nwrote ${Object.keys(items).length} of ${KEYS.length} keys to ${path.join(DIR, "media.json")}`,
);
```

- [ ] **Step 3: Encode the photographs and write a partial manifest**

Run:

```bash
scripts/footage/encode.sh photos
node scripts/footage/manifest.mjs --partial
(cd frontend-main && npx prettier --write public/media/media.json)
```

Expected: twelve `still still-<niche>  NNN KB / NN KB` lines; the manifest prints 24 `ok` rows (12 × `src` ≤ 160 KB, 12 × `srcSmall` ≤ 60 KB) and `wrote 12 of 44 keys`. An `OVER` row: raise that still's CRF in `photos()` (36 → 40 for `src`, 38 → 42 for small), re-run both commands.

- [ ] **Step 4: Look at the encodes**

```bash
for f in frontend-main/public/media/stills/still-*.avif; do
  ffmpeg -y -hide_banner -loglevel error -i "$f" "e2e/eval-shots/footage/review/$(basename "$f" .avif).png"
done
```

Read all 24 PNGs (12 full, 12 small). Expected: sharp, no banding on skin or sky, the person not cropped out by the 4:5 crop. A soft one: lower its CRF by 4 (within the target), re-run Step 3.

- [ ] **Step 5: Run the budget test**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts`
Expected: 7 passed (the `returns the manifest entry` case now runs).

- [ ] **Step 6: Prove the person check bites (Review Focus 3)**

```bash
M=frontend-main/public/media/media.json
cp "$M" e2e/eval-shots/footage/media.json.bak
jq '.items["still-yoga"].alt = "Rolled mats stacked in an empty sunlit studio"' e2e/eval-shots/footage/media.json.bak > "$M"
(cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts) || true
cp e2e/eval-shots/footage/media.json.bak "$M"
(cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts)
```

Expected: the first run FAILS with `still-yoga: alt must name the person in frame`; after the restore, 7 passed. `git diff --stat frontend-main/public/media/media.json` shows only this task's change.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add scripts/footage/encode.sh scripts/footage/manifest.mjs frontend-main/public/media
git commit -m "feat(media): encode and manifest scripts; the twelve coach photographs" -- scripts/footage/encode.sh scripts/footage/manifest.mjs frontend-main/public/media
```

---

### Task 4: The recorder, and the student on a phone

**Files:**

- Create: `scripts/footage/footage.config.ts`
- Create: `scripts/footage/record.ts`
- Modify (generated): `frontend-main/public/media/{clips,posters,stills}`, `frontend-main/public/media/media.json`

**Interfaces:**

- Consumes: `manage(args: string[]): string` from `e2e/helpers/compose.ts`; demo-yoga's seeded coach and student (`issue_login_token --role coach|student --tenant demo-yoga`); `POST/DELETE /api/v1/live/`, `/api/v1/live/<id>/start/`, `/stop/` (as in `e2e/specs/04-live-class.spec.ts`).
- Produces (inside `record.ts`, used by Tasks 5–8): `RAW`, `PROFILES` (`desktop` 1600×1000 → video 1600×1000, `tile` 1280×800 → 1280×800, `phone` 375×812 → 750×1624, all at device scale 2), `open(browser, profile, { slug?, role?, video? }) → { ctx, page, mark(name), save(name) }`, `settle(page)`, `glide(page, dy, ms)`, `sweep(page, ms)`, `hubFree()`, `url(slug, path)`. Raw outputs: `student-phone.webm` + marks `dash dash-tap lesson lesson-end live live-tap end`; `tile-student-dashboard.png`, `tile-live-class.png` (2560×1600).

Why a Playwright test file run by e2e's runner and not `npx tsx`: the repo root has no `node_modules` and `tsx` is not installed; e2e's Playwright already transpiles TypeScript, runs serially and gives `-g <flow>` to re-record one flow. `@playwright/test` does not resolve from `scripts/footage/`, so `record.ts` imports e2e's copy by path (the same file the runner and `e2e/helpers` load — one module instance) and the config is a plain object.

- [ ] **Step 1: Write the config**

```ts
// scripts/footage/footage.config.ts
// Playwright config for the footage recorder (record.ts). No import from
// @playwright/test: it does not resolve outside e2e/, and the runner only needs
// a plain object. Run from e2e/:
//   npx playwright test -c ../scripts/footage/footage.config.ts [-g <flow>]
export default {
  testDir: ".",
  testMatch: /record\.ts$/,
  timeout: 20 * 60_000,
  workers: 1,
  // A retry re-runs AI turns and recomposes sites: re-run one flow with -g instead.
  retries: 0,
  reporter: "list",
  outputDir: "../../e2e/eval-shots/footage/.pw",
};
```

- [ ] **Step 2: Write `record.ts` with the harness and the student flow**

```ts
// scripts/footage/record.ts
//
// Product footage for the landing (docs/superpowers/specs/
// 2026-10-14-premium-marketing-and-studio-design.md §5.3), recorded from the
// running dev stack. One test per flow. Each writes, under the gitignored
// e2e/eval-shots/footage/: <flow>.webm, <flow>.marks.json (seconds from the
// video's first frame; encode.sh cuts on them) and the PNG stills it takes.
//   cd e2e && npx playwright test -c ../scripts/footage/footage.config.ts -g <flow>
// A heavy job: nothing else heavy alongside it (root CLAUDE.md).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
// The repo root has no node_modules, so @playwright/test does not resolve from
// here: import e2e's copy (the same file the runner and e2e/helpers load).
import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "../../e2e/node_modules/@playwright/test";
import { manage } from "../../e2e/helpers/compose";

const RAW = path.resolve(__dirname, "../../e2e/eval-shots/footage");
fs.mkdirSync(RAW, { recursive: true });

const PROFILES = {
  // Spec 5.3: 1600×1000 at device scale 2. The video is written at 1600×1000
  // from 2x frames, so text is supersampled, not soft.
  desktop: {
    viewport: { width: 1600, height: 1000 },
    video: { width: 1600, height: 1000 },
    phone: false,
  },
  // Studio tiles: a smaller window so the UI still reads at tile size; 16:10 like the stills.
  tile: {
    viewport: { width: 1280, height: 800 },
    video: { width: 1280, height: 800 },
    phone: false,
  },
  // A phone, filmed at its device pixels (Phase 2: 750×1624).
  phone: {
    viewport: { width: 375, height: 812 },
    video: { width: 750, height: 1624 },
    phone: true,
  },
} as const;
type Profile = keyof typeof PROFILES;

const url = (slug: string, p: string) => `http://${slug}.localhost${p}`;

/** A context as `role` on `slug` (no role: a visitor). Records unless video is
 * false; a still-only context renders with reduced motion (final layout). */
async function open(
  browser: Browser,
  profile: Profile,
  o: { slug?: string; role?: "coach" | "student"; video?: boolean } = {},
) {
  const p = PROFILES[profile];
  const recording = o.video !== false;
  const ctx = await browser.newContext({
    viewport: p.viewport,
    deviceScaleFactor: 2,
    isMobile: p.phone,
    hasTouch: p.phone,
    colorScheme: "light",
    reducedMotion: recording ? "no-preference" : "reduce",
    recordVideo: recording
      ? { dir: path.join(RAW, ".tmp"), size: p.video }
      : undefined,
  });
  if (o.role && o.slug) {
    const jwt = manage([
      "issue_login_token",
      "--role",
      o.role,
      "--tenant",
      o.slug,
    ])
      .split("\n")
      .pop()!;
    await ctx.addCookies([
      {
        name: "contentor_access_token",
        value: jwt,
        domain: `${o.slug}.localhost`,
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  }
  // Next's dev badge stays out of the footage.
  await ctx.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  const page = await ctx.newPage();
  const t0 = Date.now(); // the video starts with the page
  const marks: Record<string, number> = {};
  return {
    ctx,
    page,
    /** Seconds since the first frame, for encode.sh's cuts. */
    mark: (name: string) => {
      marks[name] = Math.round((Date.now() - t0) / 100) / 10;
    },
    /** Close; when recording, save <name>.webm and <name>.marks.json under RAW. */
    async save(name: string) {
      await ctx.close();
      if (!recording) return;
      const video = page.video()!;
      await video.saveAs(path.join(RAW, `${name}.webm`));
      await video.delete();
      fs.writeFileSync(
        path.join(RAW, `${name}.marks.json`),
        JSON.stringify(marks, null, 2) + "\n",
      );
    },
  };
}

/** Wait for the network, the fonts and every rendered image, then a beat. */
async function settle(page: Page) {
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page
    .waitForFunction(
      () =>
        Array.from(document.images).every(
          (i) => i.getClientRects().length === 0 || i.complete,
        ),
      null,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
}

/** Scroll whatever is under the pointer by dy px over ms, one wheel step per
 * video frame (25 fps). Wheel, not window.scrollTo: the studio scrolls <main>. */
async function glide(page: Page, dy: number, ms: number) {
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width * 0.6, vp.height * 0.5);
  const steps = Math.max(1, Math.round(ms / 40));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(40);
  }
}

/** Move the pointer across the page in a slow arc, so hover states show. */
async function sweep(page: Page, ms: number) {
  const vp = page.viewportSize()!;
  const steps = Math.max(1, Math.round(ms / 40));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    await page.mouse.move(
      vp.width * (0.25 + 0.5 * k),
      vp.height * (0.35 + 0.2 * Math.sin(k * Math.PI)),
    );
    await page.waitForTimeout(40);
  }
}

/** The agent hub (ssh tunnel on :39300) needs an account free for an
 * interactive run and an empty queue: compose-* types run interactive there,
 * so a busy hub queues or cancels them (Review Focus 2). */
async function hubFree() {
  const res = await fetch("http://localhost:39300/lanes/studio", {
    signal: AbortSignal.timeout(3_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.warn(
      "agent hub not reachable on :39300 (tunnel down?): skipping the free-account check",
    );
    return;
  }
  const lane = (await res.json()) as Record<string, unknown>;
  const n = (v: unknown) => (Array.isArray(v) ? v.length : Number(v ?? 0));
  expect(
    n(lane.idle),
    `no idle hub account: ${JSON.stringify(lane)}`,
  ).toBeGreaterThan(0);
  expect(n(lane.queued), `hub queue not empty: ${JSON.stringify(lane)}`).toBe(
    0,
  );
}

test.beforeAll(async () => {
  // One heavy job on the Docker VM at a time (Review Focus 1): no e2e, test
  // suite, build or site eval may run while we record.
  const busy = execSync("ps -Ao command", { encoding: "utf8" })
    .split("\n")
    .filter((l) =>
      /playwright test|vitest|next build|manage\.py test|pytest|make (test|e2e|eval-sites|deploy)/.test(
        l,
      ),
    )
    .filter((l) => !l.includes("footage.config"));
  expect(busy, `another heavy job is running:\n${busy.join("\n")}`).toEqual([]);
  const health = await fetch("http://localhost/api/health/").catch(() => null);
  expect(health?.ok, "dev stack down: make dev-d").toBe(true);
});

// ── The student on a phone (Phase 2 chapter 6) ─────────────────────────────

test("student-phone", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  // A class live now, so the student's list shows it with Join (as in 04-live-class).
  const coach = await open(browser, "tile", {
    slug: "demo-yoga",
    role: "coach",
    video: false,
  });
  const created = await coach.ctx.request.post(
    url("demo-yoga", "/api/v1/live/"),
    {
      data: {
        title: "Evening unwind, live",
        description: "Thirty minutes for a stiff back after work.",
        scheduled_at: new Date(Date.now() + 60_000).toISOString(),
      },
    },
  );
  expect(created.status(), await created.text()).toBe(201);
  const cls = await created.json();
  const started = await coach.ctx.request.post(
    url("demo-yoga", `/api/v1/live/${cls.id}/start/`),
  );
  expect(started.ok(), await started.text()).toBeTruthy();
  try {
    const s = await open(browser, "phone", {
      slug: "demo-yoga",
      role: "student",
    });
    const { page } = s;
    await page.goto(url("demo-yoga", "/dashboard"));
    await settle(page);
    s.mark("dash");
    await page.waitForTimeout(1_000);
    const cont = page.getByRole("link", { name: /Continue Learning/ }).first();
    if (await cont.count()) await cont.tap();
    else await page.goto(url("demo-yoga", "/learn/yoga-for-beginners"));
    s.mark("dash-tap");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);
    s.mark("lesson");
    await glide(page, 500, 2_000);
    s.mark("lesson-end");
    await page.goto(url("demo-yoga", "/live-classes"));
    const join = page.getByRole("link", { name: /Join/ }).first();
    await expect(join).toBeVisible({ timeout: 30_000 });
    await settle(page);
    s.mark("live");
    await page.waitForTimeout(1_000);
    await join.tap();
    s.mark("live-tap");
    await page.waitForTimeout(1_500);
    s.mark("end");
    await s.save("student-phone");

    // Chapter 6's two tiles: the same two screens on a desktop, as stills.
    const d = await open(browser, "tile", {
      slug: "demo-yoga",
      role: "student",
      video: false,
    });
    await d.page.goto(url("demo-yoga", "/dashboard"));
    await settle(d.page);
    await d.page.screenshot({
      path: path.join(RAW, "tile-student-dashboard.png"),
    });
    await d.page.goto(url("demo-yoga", "/live-classes"));
    await expect(
      d.page.getByRole("link", { name: /Join/ }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await settle(d.page);
    await d.page.screenshot({ path: path.join(RAW, "tile-live-class.png") });
    await d.save("student-stills");
  } finally {
    // Leave demo-yoga as it was.
    await coach.ctx.request.post(
      url("demo-yoga", `/api/v1/live/${cls.id}/stop/`),
    );
    await coach.ctx.request.delete(url("demo-yoga", `/api/v1/live/${cls.id}/`));
    await coach.ctx.close();
  }
});
```

- [ ] **Step 3: Prove the heavy-job guard bites (Review Focus 1)**

```bash
bash -c 'exec -a vitest-guard-check sleep 60' &
GUARD=$!
(cd e2e && npx playwright test -c ../scripts/footage/footage.config.ts -g student-phone) || true
kill $GUARD
```

Expected: the run FAILS in `beforeAll` with `another heavy job is running:` and the line `vitest-guard-check 60`; no `student-phone.webm` written.

- [ ] **Step 4: Record**

Check nothing heavy runs (`ps -Ao command | grep -E 'playwright test|vitest|pytest|next build'` prints only the grep), then:
Run: `cd e2e && npx playwright test -c ../scripts/footage/footage.config.ts -g student-phone`
Expected: 1 passed; `e2e/eval-shots/footage/` holds `student-phone.webm`, `student-phone.marks.json` (7 marks), `tile-student-dashboard.png` and `tile-live-class.png`; `ffprobe -v error -show_entries stream=width,height -of csv=p=0 e2e/eval-shots/footage/student-phone.webm` prints `750,1624`.

- [ ] **Step 5: Encode, list, look**

```bash
scripts/footage/encode.sh student
node scripts/footage/manifest.mjs --partial
(cd frontend-main && npx prettier --write public/media/media.json)
F=frontend-main/public/media
ffmpeg -y -hide_banner -loglevel error -i $F/clips/clip-student-phone.mp4 -vf "fps=2,scale=300:-2,tile=6x2" -frames:v 1 e2e/eval-shots/footage/review/clip-student-phone.png
for k in tile-student-dashboard tile-live-class; do ffmpeg -y -hide_banner -loglevel error -i $F/stills/$k.avif e2e/eval-shots/footage/review/$k.png; done
ffmpeg -y -hide_banner -loglevel error -i $F/posters/clip-student-phone.avif e2e/eval-shots/footage/review/poster-clip-student-phone.png
```

Expected: the manifest rows for `clip-student-phone` (`src` ≤ 600 KB, `webm` ≤ 600 KB, `phoneSrc` ≤ 400 KB, `poster` ≤ 120 KB) and the two tiles (≤ 120 KB) are `ok`; `wrote 15 of 44 keys`. Read the contact sheet, the poster and both tiles: the sheet shows the dashboard, the lesson scrolling, the live list with the Join card — no blank or 502 page, no dev badge; the poster is the dashboard. If a frame is blank, check `docker compose ps nextjs-customer` (memory `reference-e2e-502-flakiness`), then re-record. Correct the two tiles' `alt` in `stills.json` if the screens differ from the text, and re-run the manifest.

- [ ] **Step 6: Budget test and commit**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts` — expected: 7 passed.

```bash
git branch --show-current
git add scripts/footage/footage.config.ts scripts/footage/record.ts scripts/footage/stills.json frontend-main/public/media
git commit -m "feat(media): footage recorder; the student on a phone" -- scripts/footage/footage.config.ts scripts/footage/record.ts scripts/footage/stills.json frontend-main/public/media
```

---

### Task 5: Studio tiles and scheduling a live class

**Files:**

- Modify: `scripts/footage/record.ts` (append)
- Modify (generated): `frontend-main/public/media/{clips,posters,stills}`, `media.json`

**Interfaces:**

- Consumes: `open`, `settle`, `glide`, `sweep`, `url`, `RAW` (Task 4); the studio routes `/admin/courses`, `/admin/inbox`, `/admin/community`, `/admin/media`, `/admin/blog`, Logo Studio at `/?edit=1&studio=1` (heading "Logo Studio", `e2e/specs/15-logo-studio.spec.ts`), `/admin/live` with "New class or event" and the `#event-kind`/`#event-title`/`#event-description`/`#event-when` form and its "Create" button (`frontend-customer/src/components/admin/live/event-form.tsx`).
- Produces: `studio-tiles.webm` + marks `<t>-start`/`<t>-end` for `t` in `courses messages community media blog logo`; `studio-live.webm` + marks `form`, `created`; PNGs `tile-<t>.png` for all seven tiles (2560×1600). Each tile PNG is taken at the moment its loop starts, so the still matches the loop's first frame (Phase 2 shows the still as the loop's poster).

- [ ] **Step 1: Append the two flows**

```ts
// ── Studio tiles (Phase 2 chapter 4): a still and a ≤ 4 s loop each ────────

const TILE_ROUTES = [
  ["courses", "/admin/courses"],
  ["messages", "/admin/inbox"],
  ["community", "/admin/community"],
  ["media", "/admin/media"],
  ["blog", "/admin/blog"],
  ["logo", "/?edit=1&studio=1"],
] as const;

test("studio-tiles", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const s = await open(browser, "tile", { slug: "demo-yoga", role: "coach" });
  const { page } = s;
  for (const [key, route] of TILE_ROUTES) {
    await page.goto(url("demo-yoga", route));
    if (key === "logo")
      await expect(
        page.getByRole("heading", { name: "Logo Studio" }),
      ).toBeVisible({ timeout: 30_000 });
    await settle(page);
    await page.screenshot({ path: path.join(RAW, `tile-${key}.png`) });
    s.mark(`${key}-start`);
    await sweep(page, 1_500);
    await glide(page, 320, 2_000);
    s.mark(`${key}-end`);
  }
  await s.save("studio-tiles");
});

const nextFriday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00`;
};

test("studio-live", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const s = await open(browser, "tile", { slug: "demo-yoga", role: "coach" });
  const { page, ctx } = s;
  await page.goto(url("demo-yoga", "/admin/live"));
  const add = page.getByRole("button", { name: "New class or event" });
  await expect(add).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await page.screenshot({ path: path.join(RAW, "tile-live.png") });
  s.mark("form");
  await add.click();
  await page.locator("#event-kind").selectOption("live");
  await page
    .locator("#event-title")
    .pressSequentially("Friday flow, live", { delay: 30 });
  await page
    .locator("#event-description")
    .pressSequentially("Forty-five minutes for tight hips.", { delay: 20 });
  await page.locator("#event-when").fill(nextFriday());
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/api\/v1\/(live|live-streams|zoom|onsite)\/$/.test(
        new URL(r.url()).pathname,
      ),
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const res = await saved;
  expect(res.status(), await res.text()).toBe(201);
  await expect(page.getByText("Friday flow, live").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(800);
  s.mark("created");
  // Leave demo-yoga as it was (off camera: after the last mark).
  await ctx.request.delete(
    `${new URL(res.url()).origin}${new URL(res.url()).pathname}${(await res.json()).id}/`,
  );
  await s.save("studio-live");
});
```

- [ ] **Step 2: Record**

Nothing heavy running (as in Task 4 Step 4), then:
Run: `cd e2e && npx playwright test -c ../scripts/footage/footage.config.ts -g "studio-"`
Expected: 2 passed; `studio-tiles.webm` (12 marks), `studio-live.webm` (2 marks), seven `tile-*.png` for courses, live, messages, community, media, blog, logo.

- [ ] **Step 3: Encode, list, look**

```bash
scripts/footage/encode.sh studio
node scripts/footage/manifest.mjs --partial
(cd frontend-main && npx prettier --write public/media/media.json)
F=frontend-main/public/media
for k in courses live messages community media blog logo; do
  ffmpeg -y -hide_banner -loglevel error -i $F/clips/loop-$k.mp4 -vf "fps=2,scale=400:-2,tile=4x2" -frames:v 1 e2e/eval-shots/footage/review/loop-$k.png
  ffmpeg -y -hide_banner -loglevel error -i $F/stills/tile-$k.avif e2e/eval-shots/footage/review/tile-$k.png
done
```

Expected: seven `clip  loop-<t>  NNN KB (… speed …)` lines; manifest rows `ok` for every `loop-*` (`src`/`webm` ≤ 800 KB, poster ≤ 120 KB) and `tile-*` (≤ 120 KB); no shape error; `wrote 29 of 44 keys`. Read all 14 review images: each loop sheet starts on the same screen as its tile still, shows hover and a short scroll, no spinner-only or blank frame; the live sheet shows the form being filled and the new class listed. Correct any tile `alt` in `stills.json` that does not match its screen; re-run the manifest. A loop `OVER`: shorten its window in `record.ts` (`glide` 320 → 200 px) and re-record, never raise the target.

- [ ] **Step 4: Budget test and commit**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts` — expected: 7 passed.

```bash
git branch --show-current
git add scripts/footage/record.ts scripts/footage/stills.json frontend-main/public/media
git commit -m "feat(media): studio tile stills and hover loops" -- scripts/footage/record.ts scripts/footage/stills.json frontend-main/public/media
```

---

### Task 6: "Describe it" drafting a course

**Files:**

- Modify: `scripts/footage/record.ts` (append)
- Modify (generated): `frontend-main/public/media/clips/scrub-assistant.mp4`, `posters/scrub-assistant.avif`, `media.json`

**Interfaces:**

- Consumes: `open`, `settle`, `hubFree`, `url` (Task 4); `getByTestId("describe-course")` and the "Draft it" button (`frontend-customer/src/components/admin/describe-it.tsx`); the action card's "Apply" (exact) and "Undo" buttons (`e2e/specs/29-copilot.spec.ts`). Real converse and execute against the hub (one interactive run); Undo deletes the drafted course, so demo-yoga ends as it began.
- Produces: `assistant.webm` + marks `start drafting card applied undone end`.

- [ ] **Step 1: Append the flow**

```ts
// ── "Describe it" (Phase 2 chapter 5): the line, the card, Apply, Undo ─────

test("assistant", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await hubFree();
  const s = await open(browser, "desktop", {
    slug: "demo-yoga",
    role: "coach",
  });
  const { page } = s;
  await page.goto(url("demo-yoga", "/admin/courses"));
  const line = page.getByTestId("describe-course");
  await expect(line).toBeVisible({ timeout: 30_000 });
  await settle(page);
  s.mark("start");
  await line.click();
  await line.pressSequentially(
    "A four-week beginner course for desk workers: hips, spine and shoulders, twenty minutes a day",
    { delay: 28 },
  );
  await page.getByRole("button", { name: "Draft it" }).click();
  s.mark("drafting");
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  await expect(
    apply,
    "no draft card: the assistant asked a question or the hub run failed. Re-run -g assistant",
  ).toBeVisible({
    timeout: 180_000,
  });
  s.mark("card");
  await page.waitForTimeout(2_500);
  await apply.click();
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible({ timeout: 60_000 });
  s.mark("applied");
  await page.waitForTimeout(1_500);
  await undo.click();
  await expect(undo).toHaveCount(0, { timeout: 30_000 });
  s.mark("undone");
  await page.waitForTimeout(1_500);
  s.mark("end");
  await s.save("assistant");
});
```

- [ ] **Step 2: Record**

Nothing heavy running, then:
Run: `cd e2e && npx playwright test -c ../scripts/footage/footage.config.ts -g assistant`
Expected: 1 passed; `assistant.webm` with 6 marks. A failure naming "no draft card" is Review Focus 2: check `curl -s localhost:39300/lanes/studio`, wait for an idle account, re-run.

- [ ] **Step 3: Encode, list, look**

```bash
scripts/footage/encode.sh assistant
node scripts/footage/manifest.mjs --partial
(cd frontend-main && npx prettier --write public/media/media.json)
ffmpeg -y -hide_banner -loglevel error -i frontend-main/public/media/clips/scrub-assistant.mp4 -vf "fps=4,scale=400:-2,tile=6x4" -frames:v 1 e2e/eval-shots/footage/review/scrub-assistant.png
```

Expected: `clip  scrub-assistant  NNN KB (…s raw, speed 2.5)`; manifest row `ok  scrub-assistant.src  ≤ 1500 KB`, no keyframe error; `wrote 30 of 44 keys`. Read the sheet: typing, the draft card with its course outline, "Created" with Undo, then the card undone — the story reads in order. Over 1.5 MB: `SCRUB_SPEED=3.5 scripts/footage/encode.sh assistant`, then `SCRUB_CRF=28`; never raise the target. If you needed overrides, make them the defaults at the top of `encode.sh` (both scrubs share them, so a later `encode.sh all` reproduces these files) and re-encode any scrub already made with the old values.

- [ ] **Step 4: Budget test and commit**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts` — expected: 7 passed.

```bash
git branch --show-current
git add scripts/footage/record.ts scripts/footage/encode.sh frontend-main/public/media
git commit -m "feat(media): the assistant scrub — Describe it, the card, Apply, Undo" -- scripts/footage/record.ts scripts/footage/encode.sh frontend-main/public/media
```

---

### Task 7: The setup interview, the look gallery and the composer

**Files:**

- Modify: `scripts/footage/record.ts` (append)
- Modify (generated): `frontend-main/public/media/clips/scrub-setup.mp4`, `posters/scrub-setup.avif`, `media.json`

**Interfaces:**

- Consumes: `open`, `settle`, `glide`, `hubFree`, `url` (Task 4); `manage()`; the setup interview's controls from `e2e/specs/01-signup-onboarding.spec.ts` ("What do you teach?", `getByLabel("Your answer")`, "Send", the region "Your setup guide", its busy line, `h1 ~ div.grid > button` tiles, "Choose photos for me", `/^Continue/`); the look gallery (`frontend-customer/src/components/setup-flow/look-cards.tsx`: cards are `div.grid > div > button`, a tapped look opens a dialog named "<Look>, as a page", "Keep this look"); `POST /api/v1/admin/setup-flow/build-page/` `{page, force}` → 202 and `GET /api/v1/admin/setup-flow/` → `page_builds.<page>.status` (`backend/apps/tenant_config/urls.py`, `setup_flow.build_page`); `interview_brief.FIELDS` order and `is_settled()` (a delegated field counts as answered).
- Produces: scratch tenants `footage-answer`, `footage-looks`, `footage-compose` (dropped in `afterAll`); `setup-answer.webm` (marks `ask-1 sent ask-2 picked ask-3`), `setup-looks.webm` (`gallery opened kept`), `setup-compose.webm` (`composing composing-held built scrolled`).

How each take is staged (memory `reference-scratch-tenant-parked-at-a-setup-question`): `park()` creates the tenant the way `eval_compose_site._scratch_tenant` does, answers the given fields, delegates every earlier field, and writes `setup_flow.interview.fired`. A milestone listed there never fires again, so with `FIRED_ALL` nothing builds in the background while we film; the composer take then starts the home build itself, on cue, through the same endpoint the setup flow uses, before the page loads (`/setup` polls only while something is building).

- [ ] **Step 1: Append the parking helper and the three flows**

```ts
// ── The setup interview (Phase 2 chapter 2): answering, the looks, the build ─

/** Every milestone the interview can fire: listed as fired, none starts. */
const FIRED_ALL = [
  "style:auto",
  "page:home",
  "rank:logos",
  "page:about",
  "page:contact",
  "page:faq",
  "page:events",
  "plan:membership",
  "draft:course",
  "draft:event",
  "draft:onsite",
  "draft:post",
];

/** The coach the setup takes film (the site-eval yoga brief, in interview answers). */
const COACH = {
  niche: "yoga",
  teaches: "Yoga for people who sit at a desk all day",
  photos: "stock",
  audience:
    "Office workers in their 30s to 50s who feel stiff and out of place in gym classes",
  outcome: "A looser back and hips in twenty minutes a day, without a studio",
  offers: ["course", "live", "community"],
  pitch: "Slow, kind yoga that undoes a day at the desk",
  difference:
    "Every class is built around the hips, spine and shoulders, with options for tight bodies",
};

const PARK_PY = `
import json
from django.conf import settings
from django.core.cache import cache
from django_tenants.utils import tenant_context
from apps.accounts.models import User
from apps.core.models import Domain, Tenant
from apps.core.tasks import _create_default_config
from apps.tenant_config import interview_brief as brief
from apps.tenant_config.models import TenantConfig

A = json.loads(ARGS)
slug, schema = A["slug"], A["slug"].replace("-", "_")
for old in Tenant.objects.filter(slug=slug):
    old.delete(force_drop=True)
t = Tenant.objects.create(
    name="Mara Lindqvist", slug=slug, subdomain=slug, schema_name=schema,
    owner_email=f"{slug}@example.com", provisioning_status="ready", is_published=False,
)
Domain.objects.create(domain=f"{slug}.{settings.CONTENTOR_DOMAIN}", tenant=t, is_primary=True)
t.create_schema(check_if_exists=True, verbosity=0)
ids = [f.id for f in brief.FIELDS]
stop = ids.index(A["upto"]) if A["upto"] else len(ids)
answers = dict(A["answers"])
answers["delegated"] = [i for i in ids[:stop] if i not in answers]
t.wizard_state = {"flow": "interview", "answers": answers}
t.template_niche = "yoga"
t.save(update_fields=["wizard_state", "template_niche"])
with tenant_context(t):
    _create_default_config(t, "en")
    User.objects.create_user(email=t.owner_email, name="Mara Lindqvist", role="owner", is_staff=True)
    c = TenantConfig.objects.first()
    c.brand_name = "Mara Lindqvist Yoga"
    if A.get("style"):
        c.style = A["style"]
    c.setup_flow = {"status": "active", "interview": {"turns": [], "fired": A["fired"]}, "draft_status": {}, "page_builds": {}}
    c.save()
cache.delete(f"tenant:{schema}:config")
print("parked", slug, "at", A["upto"] or "go-live")
`;

/** A scratch tenant parked at question `upto` (null: every question answered
 * or delegated, so /setup opens on go-live). */
function park(
  slug: string,
  o: {
    upto: string | null;
    answers: Record<string, unknown>;
    fired: string[];
    style?: string;
  },
) {
  const args = JSON.stringify({ slug, ...o });
  manage(["shell", "-c", `ARGS = ${JSON.stringify(args)}\n${PARK_PY}`]);
}

test.afterAll(() => {
  manage([
    "shell",
    "-c",
    "from apps.core.models import Tenant\nfor t in Tenant.objects.filter(slug__startswith='footage-'):\n    t.delete(force_drop=True)",
  ]);
});

const BUSY =
  /Thinking…|Still thinking|Making that change|Finishing your pages|Confirming your plan/;
/** Wait out the guide's turn (a turn past 12 s reads "Still thinking…"). */
async function settleGuide(guide: Locator) {
  const busy = guide.getByText(BUSY);
  await busy.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
  await expect(
    busy,
    "the guide's turn never finished: a hub run queued or cancelled?",
  ).toHaveCount(0, { timeout: 120_000 });
}

test("setup-answer", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await hubFree();
  park("footage-answer", { upto: "teaches", answers: {}, fired: [] });
  const s = await open(browser, "desktop", {
    slug: "footage-answer",
    role: "coach",
  });
  const { page } = s;
  await page.goto(url("footage-answer", "/setup"));
  await expect(page.getByText("What do you teach?")).toBeVisible({
    timeout: 60_000,
  });
  await settle(page);
  s.mark("ask-1");
  const answer = page.getByLabel("Your answer");
  await answer.click();
  await answer.pressSequentially(COACH.teaches, { delay: 35 });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  s.mark("sent");
  const guide = page.getByRole("region", { name: "Your setup guide" });
  await settleGuide(guide);
  const tiles = guide.locator("h1 ~ div.grid > button");
  const stock = guide.getByRole("button", {
    name: "Choose photos for me",
    exact: true,
  });
  await expect(tiles.first().or(stock)).toBeVisible({ timeout: 30_000 });
  await settle(page);
  s.mark("ask-2");
  if (await stock.isVisible()) {
    await page.waitForTimeout(1_200);
    await stock.click();
  } else {
    for (let i = 0; i < Math.min(3, await tiles.count()); i++) {
      await tiles.nth(i).hover();
      await page.waitForTimeout(350);
    }
    await tiles.first().click();
    const cont = guide.getByRole("button", { name: /^Continue/ });
    if (await cont.isVisible()) await cont.click();
  }
  s.mark("picked");
  await settleGuide(guide);
  await page.waitForTimeout(1_000);
  s.mark("ask-3");
  await s.save("setup-answer");
});

test("setup-looks", async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  await hubFree();
  park("footage-looks", {
    upto: "site_style",
    answers: COACH,
    fired: FIRED_ALL,
  });
  const s = await open(browser, "desktop", {
    slug: "footage-looks",
    role: "coach",
  });
  const { page } = s;
  await page.goto(url("footage-looks", "/setup"));
  const guide = page.getByRole("region", { name: "Your setup guide" });
  const looks = guide.locator("div.grid > div > button");
  await expect(looks.first(), "the look cards never came").toBeVisible({
    timeout: 90_000,
  });
  await settle(page);
  s.mark("gallery");
  for (let i = 0; i < Math.min(4, await looks.count()); i++) {
    await looks.nth(i).hover();
    await page.waitForTimeout(350);
  }
  await looks.nth(1).click();
  await expect(page.getByRole("dialog", { name: /, as a page$/ })).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
  s.mark("opened");
  await glide(page, 600, 2_000);
  await page.getByRole("button", { name: "Keep this look" }).click();
  s.mark("kept");
  await page.waitForTimeout(800);
  await s.save("setup-looks");
});

test("setup-compose", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  await hubFree();
  park("footage-compose", {
    upto: null,
    answers: COACH,
    fired: FIRED_ALL,
    style: "journal",
  });
  const s = await open(browser, "desktop", {
    slug: "footage-compose",
    role: "coach",
  });
  const { page, ctx } = s;
  // Start the home build first: /setup polls only while something builds.
  const build = await ctx.request.post(
    url("footage-compose", "/api/v1/admin/setup-flow/build-page/"),
    {
      data: { page: "home", force: true },
    },
  );
  expect(build.status(), await build.text()).toBe(202);
  await page.goto(url("footage-compose", "/setup"));
  await expect(page.getByText(/^Building your/).first()).toBeVisible({
    timeout: 60_000,
  });
  await settle(page);
  s.mark("composing");
  await page.waitForTimeout(3_000);
  s.mark("composing-held");
  // Review Focus 2: a cancelled or failed hub run stops the take; it is never
  // filmed as a finished site.
  let status = "";
  await expect
    .poll(
      async () => {
        const r = await ctx.request.get(
          url("footage-compose", "/api/v1/admin/setup-flow/"),
        );
        status = (await r.json()).page_builds?.home?.status ?? "";
        return status;
      },
      { timeout: 8 * 60_000, intervals: [5_000] },
    )
    .not.toMatch(/^(building|idle|)$/);
  expect(
    status,
    "the home build failed: a hub run cancelled? Check GET :39300/runs, then re-run -g setup-compose",
  ).toBe("ready");
  await expect(page.getByText(/^Building your/)).toHaveCount(0, {
    timeout: 30_000,
  });
  await settle(page);
  s.mark("built");
  await glide(page, 700, 2_500);
  s.mark("scrolled");
  await s.save("setup-compose");
});
```

- [ ] **Step 2: Record the three takes**

Nothing heavy running, `make ai-check` green, then:
Run: `cd e2e && npx playwright test -c ../scripts/footage/footage.config.ts -g "setup-"`
Expected: 3 passed (setup-compose takes 1–5 min while the home page composes); `setup-answer.webm`, `setup-looks.webm`, `setup-compose.webm` with their marks; afterwards `docker compose exec -T django python manage.py shell -c "from apps.core.models import Tenant; print(Tenant.objects.filter(slug__startswith='footage-').count())"` prints `0`. A failure naming the hub is Review Focus 2: wait for an idle account and re-run that one take with `-g setup-compose` (or `-answer`, `-looks`).

- [ ] **Step 3: Encode, list, look**

```bash
scripts/footage/encode.sh setup
node scripts/footage/manifest.mjs --partial
(cd frontend-main && npx prettier --write public/media/media.json)
ffmpeg -y -hide_banner -loglevel error -i frontend-main/public/media/clips/scrub-setup.mp4 -vf "fps=4,scale=400:-2,tile=6x6" -frames:v 1 e2e/eval-shots/footage/review/scrub-setup.png
```

Expected: `clip  scrub-setup  NNN KB`; manifest `ok  scrub-setup.src ≤ 1500 KB`, no keyframe error; `wrote 31 of 44 keys`. Read the sheet in order: the first question and the answer being typed; the next question with tiles hovered and one picked; the look gallery, one look opened as a page, "Keep this look"; "Building your Home page" with its stages; the composed home page in the preview, scrolling. Over 1.5 MB: `SCRUB_SPEED=3.5`, then `SCRUB_CRF=28`; if still over, shorten the takes in `record.ts` (fewer hovered tiles or looks, a shorter `glide`) and re-record — never raise the target.

- [ ] **Step 4: Budget test and commit**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts` — expected: 7 passed.

```bash
git branch --show-current
git add scripts/footage/record.ts scripts/footage/encode.sh frontend-main/public/media
git commit -m "feat(media): the setup scrub — answering, the looks, the composer building" -- scripts/footage/record.ts scripts/footage/encode.sh frontend-main/public/media
```

---

### Task 8: The site in twelve looks: phone renders and the hero cut

**Files:**

- Modify: `scripts/footage/record.ts` (append)
- Modify (generated): `frontend-main/public/media/clips/hero-looks*`, `posters/hero-looks.avif`, `stills/look-*`, `media.json`

**Interfaces:**

- Consumes: `open`, `settle`, `glide`, `hubFree`, `RAW` (Task 4); `manage(["eval_compose_site", "--style", <look>, "--brief", <json>])` (composes the `site-eval` scratch tenant with the real composer and prints one JSON line `{ host, plan_source, pages: [{ key, status, … }] }`, as `e2e/specs/91-site-eval.spec.ts` does); `e2e/fixtures/site-eval-briefs.json`.
- Produces: `look-<look>.png` (750×1624) for the 12 looks; for `journal tavola encore kinetic`: `site-<look>.webm` (desktop) and `site-<look>-phone.webm`, marks `ready scroll end`.

The twelve look names are verified against the registry (`packages/shared/src/sections/styles/*.json`): all twelve exist and are `enabled: true`. The fixture file has no martial-arts, beauty, family or outdoors coach; four briefs are added here in the same shape.

- [ ] **Step 1: Check the hub's quota and say the cost**

Run: `curl -s localhost:39300/accounts | jq '.'`
Expected: every `studio-*` account `ready`. Twelve composes are about 70 hub runs over about an hour. If any studio account's 7-day `usedPct` is above 80, stop and ask the owner before Step 3.

- [ ] **Step 2: Append the flow**

```ts
// ── The site in twelve looks (Phase 2 chapters 1 and 3) ───────────────────

type Brief = {
  id: string;
  brand: string;
  niche: string;
  description: string;
  followups?: { q: string; a: string }[];
  goals?: string[];
};

const EXTRA_BRIEFS: Brief[] = [
  {
    id: "martial-arts",
    brand: "Kenji Mori Karate",
    niche: "martial_arts",
    description:
      "I teach traditional karate to adults who never trained before. Classes build stance, balance and confidence step by step, with plenty of pad work and no sparring until you are ready.",
    followups: [
      {
        q: "Who is your ideal student?",
        a: "Adults from 25 to 50, men and women, who want discipline and fitness without a fight-club feel.",
      },
    ],
    goals: ["sell_courses", "run_live_classes", "build_community"],
  },
  {
    id: "beauty",
    brand: "Elif Aydın Makeup",
    niche: "beauty",
    description:
      "I teach everyday makeup to women who feel lost in the beauty aisle: one fresh ten-minute face first, then evening and event looks, with the products they already own.",
    followups: [
      {
        q: "Who is your ideal student?",
        a: "Women from 25 to 45 who want to look polished for work and events without a full kit.",
      },
    ],
    goals: ["sell_courses", "run_live_classes", "sell_downloads"],
  },
  {
    id: "family",
    brand: "Kind Mornings",
    niche: "family",
    description:
      "I help parents of toddlers turn mornings and bedtimes into calm routines: short video lessons, printable routine charts and a weekly live question hour.",
    followups: [
      {
        q: "Who is your ideal student?",
        a: "Tired parents of one- to four-year-olds who want fewer battles at the door and at bedtime.",
      },
    ],
    goals: ["sell_courses", "run_live_classes", "sell_downloads"],
  },
  {
    id: "outdoors",
    brand: "Ridge & Pine Guiding",
    niche: "outdoors",
    description:
      "I prepare beginners for their first multi-day hikes: route planning, packing light, map reading and safe pacing, then guided weekend trips in the Alps.",
    followups: [
      {
        q: "Who is your ideal student?",
        a: "City people in their 30s and 40s who walk a lot but have never slept on a mountain.",
      },
    ],
    goals: ["sell_courses", "run_live_classes", "build_community"],
  },
];
const BRIEFS: Brief[] = [
  ...JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../e2e/fixtures/site-eval-briefs.json"),
      "utf8",
    ),
  ),
  ...EXTRA_BRIEFS,
];
/** Phase 2's twelve look cards, each composed for the brief of its niche. */
const LOOK_BRIEFS: Record<string, string> = {
  journal: "yoga",
  kinetic: "fitness",
  encore: "music",
  studiofloor: "dance",
  tavola: "cooking",
  primer: "language-tutoring",
  dojo: "martial-arts",
  workshop: "painting",
  atelier: "beauty",
  sprout: "family",
  trail: "outdoors",
  nocturne: "wellness",
};
/** The hero's four-looks cut (encode.sh HERO_LOOKS, same order). */
const HERO_LOOKS = ["journal", "tavola", "encore", "kinetic"];

/** Scroll the page through so lazy images load, back to the top, then settle. */
async function preload(page: Page) {
  await settle(page);
  await page.evaluate(async () => {
    for (
      let y = 0;
      y < document.documentElement.scrollHeight;
      y += innerHeight / 2
    ) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    scrollTo(0, 0);
  });
  await settle(page);
}

for (const [look, briefId] of Object.entries(LOOK_BRIEFS)) {
  test(`looks:${look}`, async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    await hubFree();
    const brief = BRIEFS.find((b) => b.id === briefId)!;
    const out = manage([
      "eval_compose_site",
      "--style",
      look,
      "--brief",
      JSON.stringify(brief),
    ]);
    const composed = JSON.parse(out.split("\n").pop()!) as {
      host: string;
      plan_source: string;
      pages: { key: string; status: string }[];
    };
    // Review Focus 2: a fallen-back plan or a failed build is not filmed.
    expect(
      composed.plan_source,
      `${look}: the site plan fell back to the recipe; re-run -g looks:${look}`,
    ).toBe("ai");
    expect(
      composed.pages.find((p) => p.key === "home")?.status,
      `${look}: home did not build`,
    ).toBe("ready");
    const site = `http://${composed.host}/`;

    // The look card's phone render.
    const still = await open(browser, "phone", { video: false });
    await still.page.goto(site);
    await preload(still.page);
    await still.page.screenshot({ path: path.join(RAW, `look-${look}.png`) });
    await still.save(`look-${look}`);
    if (!HERO_LOOKS.includes(look)) return;

    // The hero's cuts: about six seconds of the home page on a desktop and on a phone.
    for (const [profile, name, dy] of [
      ["desktop", `site-${look}`, 900],
      ["phone", `site-${look}-phone`, 520],
    ] as const) {
      const s = await open(browser, profile);
      await s.page.goto(site);
      await preload(s.page);
      s.mark("ready");
      await s.page.waitForTimeout(800);
      s.mark("scroll");
      await glide(s.page, dy, 4_000);
      await s.page.waitForTimeout(800);
      s.mark("end");
      await s.save(name);
    }
  });
}
```

- [ ] **Step 3: Record**

Nothing heavy running (this is the heaviest take: an hour of composes; no e2e, no `make eval-sites` in another session), then:
Run: `cd e2e && npx playwright test -c ../scripts/footage/footage.config.ts -g "looks:"`
Expected: 12 passed; twelve `look-<look>.png` (750×1624); `site-<look>.webm` and `site-<look>-phone.webm` for journal, tavola, encore and kinetic. A failed look: re-run it alone (`-g looks:dojo`).

- [ ] **Step 4: Encode, list, look**

```bash
scripts/footage/encode.sh looks
node scripts/footage/manifest.mjs --partial
(cd frontend-main && npx prettier --write public/media/media.json)
F=frontend-main/public/media
ffmpeg -y -hide_banner -loglevel error -i $F/clips/hero-looks.mp4 -vf "fps=2,scale=400:-2,tile=6x4" -frames:v 1 e2e/eval-shots/footage/review/hero-looks.png
ffmpeg -y -hide_banner -loglevel error -i $F/posters/hero-looks.avif e2e/eval-shots/footage/review/poster-hero-looks.png
for l in journal kinetic encore studiofloor tavola primer dojo workshop atelier sprout trail nocturne; do
  ffmpeg -y -hide_banner -loglevel error -i $F/stills/look-$l.avif e2e/eval-shots/footage/review/look-$l.png
done
```

Expected: `clip  hero-looks  ≤ 2500 KB`; manifest rows `ok` for `hero-looks` (`src` and `webm` ≤ 2500 KB, `phoneSrc` ≤ 1000 KB, poster ≤ 120 KB) and every `look-*` (≤ 120 KB / ≤ 50 KB); `wrote 44 of 44 keys`. Read the hero sheet (four looks, three seconds each, the phone in its ink frame bottom right, each look's own photos and type), its poster (look one, sharp — it is the LCP image) and all twelve renders: each the right look, the coach's own content, no empty photo slot, no dev badge. Correct any `look-*` alt in `stills.json` that does not match, re-run the manifest. Hero over 2.5 MB: shorten the windows (`-t 3` → `-t 2.5` in `hero()`), never raise the target.

- [ ] **Step 5: Budget test and commit**

Run: `cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts` — expected: 7 passed.

```bash
git branch --show-current
git add scripts/footage/record.ts scripts/footage/stills.json frontend-main/public/media
git commit -m "feat(media): the hero four-looks cut and twelve look renders" -- scripts/footage/record.ts scripts/footage/stills.json frontend-main/public/media
```

---

### Task 9: The full manifest, its checks proven, the budget green

**Files:**

- Modify (generated): `frontend-main/public/media/media.json`

**Interfaces:**

- Consumes: everything above.
- Produces: the final 44-key `media.json` (no `--partial`), committed with every file it names.

- [ ] **Step 1: Write the full manifest**

Run:

```bash
node scripts/footage/manifest.mjs
(cd frontend-main && npx prettier --write public/media/media.json)
jq '.items | length' frontend-main/public/media/media.json
```

Expected: every row `ok`, `wrote 44 of 44 keys`, `44`.

- [ ] **Step 2: Prove the scrub and poster checks bite (Review Focus 4 and 5)**

```bash
shasum frontend-main/public/media/media.json
C=e2e/eval-shots/footage/media-copy
rm -rf "$C" && cp -R frontend-main/public/media "$C"
cp "$C/clips/loop-courses.mp4" "$C/clips/scrub-setup.mp4"          # predicted frames where a scrub must be all-keyframe
cp "$C/posters/hero-looks.avif" "$C/posters/clip-student-phone.avif" # a 1600×1000 poster on a 750×1624 clip
MEDIA_DIR="$C" node scripts/footage/manifest.mjs --partial || true
rm -rf "$C"
shasum frontend-main/public/media/media.json
```

Expected: exit 1 with, among the problems, `scrub-setup: not all-keyframe: encode.sh must pass -g 1` and `clip-student-phone: poster 1600×1000 ≠ clip 750×1624`; the real manifest is untouched: run `shasum frontend-main/public/media/media.json` before the block and after it; the two sums are equal.

- [ ] **Step 3: Preview the full-scroll budget (Phase 2 holds the test)**

```bash
node -e '
const fs = require("fs"), m = require("./frontend-main/public/media/media.json").items;
const sz = (p) => fs.statSync("frontend-main/public" + p).size, sum = (a) => a.reduce((t, p) => t + sz(p), 0) / 1048576;
const posters = ["hero-looks", "clip-student-phone", "scrub-setup", "scrub-assistant"].map((k) => m[k].poster);
const tiles = Object.keys(m).filter((k) => k.startsWith("tile-")).map((k) => m[k].src);
const cards = [["still-yoga", "look-journal"], ["still-fitness", "look-kinetic"], ["still-music", "look-encore"], ["still-dance", "look-studiofloor"]];
const desk = sum([m["hero-looks"].src, m["scrub-setup"].src, m["scrub-assistant"].src, m["clip-student-phone"].src, ...posters, ...tiles, ...cards.flatMap((c) => c.map((k) => m[k].src))]);
const phone = sum([m["hero-looks"].phoneSrc, m["clip-student-phone"].phoneSrc, ...posters, ...tiles, ...cards.slice(0, 2).flatMap((c) => c.map((k) => m[k].srcSmall))]);
console.log(`desktop ${desk.toFixed(2)} MB (<= 8), phone ${phone.toFixed(2)} MB (<= 4)`);'
```

Expected: `desktop` ≤ 8 and `phone` ≤ 4 (the same sums Phase 2's `landing-media.test.ts` computes, in MiB). Over: shrink the biggest contributor first — the two scrubs (`SCRUB_SPEED` up), then the tile stills (CRF 28 → 32) — re-encode that group, re-run Step 1.

- [ ] **Step 4: Budget test, folder size, the frontend suite**

```bash
(cd frontend-main && npx vitest run src/lib/__tests__/media-budget.test.ts)
du -sh frontend-main/public/media
```

Expected: 7 passed; `du` prints at most `35M` (about 15–20M is typical at these targets). Then, nothing else heavy running: `make test-frontend` — expected: both apps green.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git status --short frontend-main/public/media scripts/footage
git add frontend-main/public/media
git commit -m "feat(media): full media manifest, 44 keys inside the budget" -- frontend-main/public/media
git ls-files frontend-main/public/media | wc -l
find frontend-main/public/media -type f | wc -l
```

Expected: `git status` lists only paths under those two folders; after the commit the two counts are equal (every file the manifest names is in git — Phase 5 Task 1 checks the same).

---

## Self-review

- **Spec coverage (5.3, row "1 Media" of section 6):** `record.ts` with Playwright, 1600×1000 at scale 2, `recordVideo`, one webm per flow, phone flows at 375×812 (Tasks 4–8); flows: setup answering + look gallery (Task 7), the composer on a parked scratch tenant with milestones pre-fired and the build started on cue (Task 7), "Describe it" drafting a course (Task 6), scheduling a live class (Task 5), the student on a phone opening a lesson and a live class (Task 4), the site in four looks on desktop and phone (Task 8, plus all twelve renders). `encode.sh` with CRF 23, maxrate ≤ 2.5M, faststart, VP9 twin, `-g 1` for scrubs only, 720 px phone encode, AVIF posters from the first frame, 2x AVIF stills (Task 3). `manifest.mjs` with width/height/bytes/durationS from ffprobe (Task 3). Photography with person-in-frame searches, 4:5, AVIF at 1600 (long edge) and 800 px, alt from the description, licence in the manifest (Tasks 2–3). `media.ts` + `media-budget.test.ts` test-first (Task 1). Media committed under 35 MB, no LFS, `du -sh` (Task 9). Cache-rule paths named in Global Constraints. Not planned, by the lead's reconciliation: image-to-video loops, 16:9 banners, a studio Overview recording (no consumer) — listed under "Out of scope".
- **Placeholder scan:** the only fill-ins are execution data — the signed URL, id, description and licence of each Pix4Less pick (Task 2 Step 4), which do not exist before the search. Every code step carries its full code; every helper used later (`open`, `settle`, `glide`, `sweep`, `hubFree`, `url`, `park`, `settleGuide`, `preload`, `segments`, `webm`, `phone`, `poster`, `avif`, `still`, `loop`, `hero`) is defined in a task.
- **Type and name consistency:** flow names and marks in `record.ts` match `encode.sh`'s segment strings (`student-phone:dash:dash-tap`, `studio-tiles:<t>-start:<t>-end`, `studio-live:form:created`, `assistant:start:drafting`/`card:end`, `setup-answer:ask-1:sent`/`ask-2:picked`, `setup-looks:gallery:kept`, `setup-compose:composing:composing-held`/`built:scrolled`, `site-<look>[-phone]:scroll`); PNG names match `still` calls; `HERO_LOOKS` has the same order in both files; `KEYS` in `manifest.mjs` equals Phase 2's `LANDING_MEDIA` key set; `MediaItem` fields match Phase 2's contract; output paths match the "Contracts produced" names.
- **Review Focus:** each of the five lines has a pin that runs: Task 4 Step 3 (guard), the hub assertions in Tasks 6–8, Task 2 Step 5 + Task 3 Step 6 (person), Task 9 Step 2 (keyframes, poster size).
