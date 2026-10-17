# The Designer, end to end: design

Date: 2026-10-17 · Status: direction approved by the owner in conversation the same day ("It looks
amazing, I liked it. Build it.") after the mockup `.superpowers/brainstorm/5492-1792257862/content/photo-studio.html`
(git-ignored; serve it with the brainstorm companion or open it next to its images and press Play) ·
Builds on `2026-10-17-agent-team-studio-design.md` (the team spec): this is its first specialist
taken all the way.

## 1. Intent

The owner wants to work through the team one specialist at a time, starting with the Designer, and
make each one complete before moving to the next. For the Designer two things are missing:

- **Covers.** The Designer can only pick one library photo for a course or event cover and show it
  on a card. It cannot make a designed cover (her colours, her logo, a title on the photo), cannot
  make a new photo, and never looks at her other covers. The owner wants a basic photo studio with
  Canva-style tools that she can use by hand and that the Designer can drive.
- **Live work.** The Designer's work does not show up where it happens. It replies with cards and
  links and she clicks through to find the result ("it gives links and you click, go"). The owner
  wants the screen to update in front of her as the work happens, as in the team spec's approved
  live-building mockup.

The run plumbing from the team spec's rung 1b shipped on 2026-10-17 (10b0df47..907cdd86): the team's
turns run in Celery on the `agents` worker, the panel polls them, and Stop, "ready for you" and busy
faces work. A run is still one old copilot turn: its only events are thinking, reply and done; it
writes nothing until she clicks Apply; and no page listens to its events. This design builds the
live half, for the Designer first.

## 2. Goals, non-goals, anti-goals

Goals

- A photo studio in Site where she makes and edits course and event covers by hand: layouts, photos
  (hers, Contentor's library, new ones made by AI), text, badges and shapes, her logo, colours and
  fonts, simple photo edits, undo.
- Asked for a cover, the Designer looks at her other covers first, finds or makes a photo that sits
  with them and is not already used, asks a short question when it needs to (her photos,
  Contentor's, or a new one), and builds the cover in the studio while she watches. Its cursor picks
  the tools, a tag in its colour says what it is doing, text types in and the photo fades in. Every
  layer stays editable and she can take over at any point.
- A cover never has its words cut off, whatever shape her site shows it in.
- Nothing changes on a course, event or the live site until she keeps it, and a kept change can be
  undone from History.
- The Designer's site work (pages, sections, look, navbar, logo, section photos) also happens live,
  in the site editor, instead of as cards and links.

Non-goals

- A full Canva: no video, animation, collaboration, print or stock music.
- Words drawn inside AI-generated images (Pix4Less `generate_thumbnail`). Text is always an
  editable layer.
- Replacing the Logo Studio. It stays; the photo studio uses the logo it makes.
- Live work for the other five specialists. They come next, one at a time, on the pieces built here.

Anti-goals: it fails, even if it works, when

- the Designer's covers look templated or unrelated to her other covers;
- it reuses a photo that is already on another of her covers without saying so;
- it spends her monthly new-photo allowance without her asking for a new photo;
- a cover's title is cut off on her site, or a cover looks broken in a small thumbnail;
- her screen is pulled away while she is doing something else (team spec);
- the studio only works when the Designer drives it.

## 3. Decisions

| # | Decision | Source |
|---|---|---|
| E1 | Work through the specialists one at a time, end to end, starting with the Designer. For the Designer this replaces the team spec's order (§7: 1b for everyone, then 3, then 2). The shared pieces built here are reused by the next specialists. | Owner |
| E2 | The Designer makes course and event covers as designed images, in a photo studio. | Owner |
| E3 | Canva-style tools, as in the approved mockup: layouts (including "your set"), photos from three sources, text, elements, brand, uploads, a new photo by AI, photo edits, sizes. | Owner |
| E4 | Before making a cover the Designer checks her existing covers and similar photos, and can create a similar one. | Owner |
| E5 | The Designer asks follow-up questions, such as her own photos or Contentor's. | Owner |
| E6 | The Designer drives the studio live: its cursor picks the tools, a tag shows what it is doing, the screen follows the work. | Owner |
| E7 | The photo studio lives in Site, as a "Photo studio" tab next to Edit site, Design and Media. The cover field of a course or event opens it for that item. Site is already the Designer's section. | Mockup, approved |
| E8 | Nothing changes until Keep; Keep can be undone from History. | Mockup, approved; team spec T6 and T13 |
| E9 | A cover comes in three sizes drawn from one design: **Card** (the shape her look shows covers in, e.g. 4:3, 3:4 or 1:1), **Wide** (16:9, for lists and course cards) and **Banner** (3:1, for course and event pages). The Designer fills all three; she edits Card and can fine-tune the others. Every place on her site shows the nearest size; a very small thumbnail shows only the photo. | Owner (chose "one design, three shapes" on the comparison page `cover-sizes.html`). Why: today the looks crop covers to anything from 3:4 to about 4:1 (`components/sections/*/courses.tsx`, `course-card.tsx` `h-44`, the course page's `h-64`/`h-80` banner), so one image with words on it would lose them on most looks. |
| E10 | Covers are drawn live from their design wherever they appear (site sections, course and event pages, student dashboard, store, admin), by one shared renderer. No image file is made in this work. | Owner (same choice: covers drawn live, following a look change). Why: every place a cover shows today is React, and no email or link preview uses covers. Drawing live keeps text sharp, lets covers follow a look change, avoids AVIF artefacts around text, and keeps rendered covers out of her photo library. An image file arrives with sizes for social posts (stage 5). |
| E11 | Text on a cover uses her look's two fonts (display and body) and her look's colours, by role, so a look change carries over to her covers. A colour can also be a custom hex. | My call. More fonts can come later. |
| E12 | A new photo is generated only when she chooses "Make a new one" or asks for one in words. It counts against the existing allowance of 20 new photos a month per site (`CURATED_IMAGE_GENERATE_MONTHLY_LIMIT`), shared by her and the Designer, and the Designer says how many are left. | My call, from the anti-goals |
| E13 | Build order and shipping: five stages (§8), each with its own plan, shipped on its own (tests, commit, deploy, verify on prod). | My call, the team spec's practice |
| E14 | An event's cover belongs to its series: every row of the same event kind with the same title (a weekly class from /setup or "Describe it" is many rows sharing a title and photo). Keep puts it on the whole series, sessions added later included, and Undo restores each. A series counts as one cover when the Designer looks for photos already in use. | My call, from the builder check |
| E15 | Where a look writes its own words over the cover image (the `rows` billboard and tiles, kinetic's poster, the catalog's overlay card style), the cover shows without its words: photo, colours, shapes and logo, under the look's own title. Effects a look puts on the photo (greyscale, hover zoom, the arch mask) keep working on the photo. | My call, from the builder check |
| E16 | A cover's words follow the item. The title shows the course or event's current title unless she typed her own words. Badges are kinds: "New" (shows while the course is new), "Next date" (the series' next session, gone when none is upcoming), "Live", and her own words (shown as typed). A renamed course or a moved class never shows stale words. | My call, from the builder check |
| E17 | Cover colours come from a palette drawn from her look: its brand colours (primary, accent), its dark and light colours (foreground, background, inverse), and lighter and darker tones of primary and accent computed in oklch. Each is stored by role, so it follows a look change. She can also pick any hex, which does not follow. The Designer varies the panel colour across her covers from this palette and checks text contrast. | My call, from the builder check |
| E18 | Advanced editing is for computers only. On a phone she previews her covers in every size, changes the words, photo, layout and colours from simple lists, and keeps or discards. Dragging, resizing and the Designer's live build on the canvas need a computer, where the Team panel sits beside the canvas. | Owner |

## 4. The photo studio

### 4.1 Where she finds it

- **Site → Photo studio** lists her courses and events, each with its current cover (designed,
  plain photo, or none) and any draft. "Design a cover" opens the editor for that item.
- The **course form's cover field** gets "Design a cover" next to the photo picker. The **event
  form**, which has no cover field today, gets one: the current cover and "Design a cover".
- The studio is a full page inside the creator studio. The left nav collapses to icons while it is
  open, and the Team panel stays docked on the right, as in the mockup.

### 4.2 The editor

As in the mockup: a top bar (the item, the size, Undo and Redo, **Keep on course** or **Keep on
event**), a tool rail with a drawer, the canvas, and a strip of her other covers under the canvas.

The tool rail:

- **Layouts.** "Your set" (the layout and colours of her most recently kept design, with this
  item's words and photo) and six built-in layouts: colour panel with photo, full photo with title,
  title only, photo with a colour band, framed photo, photo only. Applying a layout keeps her words,
  photo and colours.
- **Photos**, three tabs:
  - **Yours**: her Media photos, searchable, with upload.
  - **Contentor**: the Pix4Less library. Photos already on another of her covers carry an "In use
    on …" mark.
  - **New**: describe a photo and generate it. It takes about a minute, while a shimmer holds its
    place. Shows how many new photos are left this month.
- **Text**: add a title, a subtitle or a line of text; edit text in place on the canvas. The title
  shows the item's own title until she types other words (E16). The text toolbar sets font
  (display or body), size, weight, case, letter spacing, line height, colour and alignment.
- **Elements**: badges ("New", "Next date", "Live", or her own words; E16) and shapes (rectangle,
  circle, arch, line).
- **Brand**: her logo, the colours drawn from her look (E17) and her look's fonts.
- **Uploads**: drop photos; they join her Media photos through the existing upload pipeline.
- **New photo**: a shortcut to Photos → New.

On the canvas she can select a layer, move it, resize it, nudge it with the arrow keys, delete it,
duplicate it, and bring it forward or send it back. A photo can be repositioned and zoomed inside
its frame, and its brightness, contrast and saturation changed, with an optional darkening for text
legibility. Undo and redo cover every edit. The draft saves itself.

On a phone (E18) the same page shows the cover in each size with simple controls instead of the
canvas: the words, a photo from the same three sources, a layout, a colour from her palette, and
Keep or Discard.

### 4.3 Sizes

Above the canvas: **Card · Wide · Banner** (E9). Card is the shape her current look shows covers
in, and it opens first. Wide and Banner are drawn from the same layout with the same words, photo
and colours. She can open either and fine-tune it, and those adjustments belong to that size only.
If her look changes later, Card follows the new look's shape.

### 4.4 Keep, Discard, History

- **Keep on course / event** makes the design that item's cover: every size, everywhere, and for an
  event the whole series (E14). It also sets the item's cover photo to the design's photo, so code
  that only knows photos still shows the right one. It records a History row signed by whoever made
  the design (her, or the Designer).
- **Undo** from History restores the previous cover, whether that was a design, a plain photo or
  none, and refuses if the cover has changed since.
- **Discard** deletes a draft. Choosing a plain photo as the cover elsewhere (the photo picker, or
  /setup) replaces a kept design with that photo, as today.

## 5. The Designer in the studio (live)

### 5.1 What it does

Asked for a cover, from any page or from the studio:

1. **Looks at her covers.** It reads her kept designs (layouts, colours, fonts) and her plain photo
   covers (each photo's description, colours and source). It names what her set has in common in
   one line ("Your set: colour panel left, photo right, serif title, your mark on top"). With no
   designs yet it proposes a layout that suits her look and says the cover starts her set.
2. **Asks, only when it has to.** If it does not know where the photo should come from, it asks
   "Which photos should I use?" with tap choices: **My own photos**, **Contentor's library**,
   **Make a new one for me**. It skips the question when she already said (in her request, or with
   the setup interview's photos answer and enough ready photos of her own), and answers a choice
   with what it found ("You haven't uploaded photos yet, so the library is a good start").
3. **Finds or makes a photo.**
   - Her own: searches her private Pix4Less space.
   - Library: searches with the course's subject plus her look's photo words, ranked towards her
     covers' colours, and skips photos already on another cover.
   - New: generates one in the style of her covers (subject plus a style line from her look and
     her covers' feel), in the Card shape's aspect, against the allowance (E12).
4. **Builds the cover.** Her set's layout (or the proposed one), the item's words (a short label,
   the title, a subtitle), her logo, a colour from her look that sits with her other covers and
   preferably one they don't use yet, and a badge where it fits ("New" for a course not yet
   published).
5. **Hands it over.** "Here it is" with one line of reasoning, and **Keep on course**, **Try
   another photo** and **I'll edit it**. Nothing changes on the course until she keeps it.

### 5.2 What she sees

- **The screen follows the work** under the team spec's rule: if she asked from the course page or
  the studio and has not navigated since, the studio opens on the new draft. Otherwise her screen
  stays put, the panel says "ready for you", and the link opens the studio.
- **In the studio** the Designer's cursor (a pointer in its colour with its name) moves to the tool
  it uses, the drawer opens on that tool, the search box types the query, results appear and the
  chosen one is outlined, the layout lands, each text layer types in under a selection box tagged
  "Designer · writing", the logo and badge fade in, and the colour swatch is picked. The tag also
  marks the covers strip while it looks at her covers ("Designer · looking"). The canvas is locked
  while the Designer works; **Stop** in the panel jumps to the finished state and unlocks it.
- **In the panel** the reply lists the work as steps, each with a spinner and then a tick (looking at
  your covers, asking which photos, finding a photo, laying it out, writing the title, adding your
  logo and colours, adding a badge), then the hand-over and the choice buttons.
- **Try another photo** swaps only the photo (a fresh search that skips what it already showed) and
  replays just that step. **I'll edit it** dismisses the hand-over and selects the title.

### 5.3 How the replay works

The work is written in one server step and replayed in the browser (team spec §6.2 "writes and
events have different grain", §6.3 "the reveal plays over complete data"). The run makes the draft
design in one go, then emits a few events: the covers it looked at, the photo search (query, results
shown, the pick) or the generation it started, and the finished design. The studio animates from
those events plus the finished design: the order of tools and layers follows the design's own
layers. A studio opened after the replay has finished just shows the design.

## 6. The Designer on the site (live)

The team spec already designs this (§5.2 live work, §5.3 build and suggest, §6.3 the site editor);
stage 3 builds it for the Designer:

- Before her site's first go-live, the Designer's page, section, look, navbar, logo and photo changes
  are written as the work happens, and the site editor's canvas shows them land under the
  Designer's tag, the same way covers do in the studio.
- After go-live they are suggestions. The canvas shows the suggested version with a bar naming the
  Designer and offering Keep and Discard, saving is suspended meanwhile, and the public site changes
  only on Keep. Keep goes through today's execute path, so History and undo are unchanged.
- The editor's pending autosave is cancelled when an outside change arrives (today it can overwrite
  it).
- The site editor sends its page context with a turn (today it is dropped off `/admin`), and gets
  the run follower that `/admin` already has.

## 7. How it works

### 7.1 The design

A new tenant model, `Design` (in `apps.media`, next to photos and videos):

- **What it belongs to:** a kind (`cover` now; social post, story, email header and blog cover
  later), a target, and a state (`draft`, `kept`, `retired`). The target is a course (by id) or an
  event series (one of the four event models, by kind and title; E14). Each target has at most one
  kept design. Keeping a design retires the previous one.
- **Who made it:** `made_by` (her, or a specialist key), plus the run that made it, if any.
- **Its recipe** (JSON):
  - the layout's id;
  - the content: photo (id, focus, zoom, adjustments), label, title (the item's own title, or her
    words), subtitle, badge (a kind, or her words), and whether the logo shows;
  - the style: font role and colour (a role from the palette of E17, or a hex) for each part;
  - extra layers she added (text, badge, shape, each with a frame in canvas fractions);
  - per-size overrides (frame and scale for any layer, per Card, Wide or Banner).

  A layout is a function from content and aspect to positioned layers, so one recipe draws in any
  size. A validator modelled on `tenant_config/logo_recipe.py` checks enums, lengths, numbers and
  hex values, and that every photo id is one of her photos.
- **The API:** her designs (list, create, read, update, delete), Keep, and the photos a design needs
  as signed URLs. Course and event serializers add `cover_design` (recipe, resolved photo URLs, her
  logo URL) when a kept design exists.

### 7.2 One renderer

`CoverArt` draws a recipe as HTML and CSS, with no hooks, so server components can use it. It is
used by the studio canvas (with an editing overlay on top), the site's section image component
`Img` (`components/sections/kit.tsx`, through a `courseCover(c)` value next to `courseImage`),
`course-card.tsx`, the course and event pages, event lists, the student dashboard, the store and the
admin lists.

- It applies her look's palette and fonts to itself (`site-styles.ts` `styleScope`, and the look's
  Google Fonts link wherever the tenant theme is off, as in `/admin`). Covers always use the look's
  light colours, like a photo would.
- CSS container queries pick the nearest size by the frame's aspect ratio, and fall back to the
  photo alone when the frame is narrower than about 180 px. Text sizes are relative to the frame,
  so nothing needs measuring.
- A word-free mode draws everything but the words and badges, for the slots where a look writes its
  own words over the cover (E15).
- It is given the item's title, next date and status, so linked words and badge kinds resolve
  where it draws (E16).
- Each look's Card shape is a new `coverAspect` field in its manifest (`packages/shared/src/sections/styles/*.json`,
  synced to the backend), read from today's look components (3/4, 4/5, 1/1, 3/2, 16/10 or 4/3).

### 7.3 The studio's editing

- History and undo reuse `lib/logo/history.ts` (`EditHistory`).
- Selection, dragging with pointer capture, handles and arrow-key nudges generalise the Logo
  Studio canvas (`components/logo/studio-canvas.tsx`) from three fixed parts to a list of layers.
- The logo layer uses her uploaded logo image, recoloured white, black or original.
- Photos come through the existing endpoints: Media photos, `curated-images` search and `use/`
  (which copies a library photo into her storage), and `generate/` with its job polling. A
  library photo is copied into her storage when it is placed on the canvas, as the blog image
  dialog does today.

### 7.4 The Designer's engine work (stage 2)

- **A `design_cover` action**, owned by the Designer, becomes its way to make a cover: the target,
  the photo source and description, the layout, the words, the colour and the badge. It runs in the
  run's Celery task (`engine._card`) and writes a draft design, which students cannot see (team spec
  T6, build). A plain photo cover is the "photo only" layout. Keep is her click on the result.
- **A covers digest** in the Designer's turn: each course and event cover (designed: layout and
  colours; plain photo: description, colours and source; none), the photo ids already in use, her
  own-photo count and the setup interview's photos answer, new photos left this month, and her
  look's Card shape, fonts and colours.
- **Questions with choices:** `ask` gains up to four options. The panel shows them as tap chips, and
  a tap sends the option as her reply. The mechanism is the engine's, so the other specialists get
  it too.
- **Similar photos:** library searches pass her covers' colours (the service filters on `hex` and
  `palette`; add them to `curated_images.client.search` if missing) and skip the photos on her
  covers: her own photos by `Photo.catalog_id`, library copies by their storage key
  (`curated_images.cache.asset_id_from_key`). An event series counts once (E14). Generation adds a
  style line built from her look's `photoWords` and her covers' colours.
- **Run events,** through the existing `runs.emit`: a step starting or finishing (label and
  specialist), the covers it looked at, a photo search (query, results shown, pick), a generation
  started or finished, a design written. The panel reads the steps; the studio reads the rest.

### 7.5 Shared live pieces (stage 2, reused by later specialists)

The specialist's cursor, the "Specialist · doing" tag with the outline on the thing being worked on,
a typing hook, and a run-events hook built on `lib/copilot/runs.ts` (`useRun` exists with no
consumers). The studio is their first user, and the site editor (stage 3) the second.

## 8. Stages

| Stage | What she gets | Main pieces |
|---|---|---|
| 1. Covers she can design | The photo studio of §4, and designed covers on her site | `Design` model and API, recipe validator, `CoverArt` and the seven layouts, the editor and its drawers, sizes, Keep and Undo, the cover entry points, every cover slot drawing designs |
| 2. The Designer designs in front of her | §5 | `design_cover`, the covers digest, questions with choices, run events, the shared live pieces, the studio replay, panel steps, Try another photo |
| 3. The Designer on her site, live | §6 | Live build and suggest in the site editor, the autosave fix, context and runs in the editor |
| 4. More studio tools | Decorations (spot illustrations, textures, dividers, icons from the decorative catalog), rotation, a colour tint or duotone on photos, alignment guides | Elements and photo-edit additions; the Designer may use them |
| 5. Sizes and sets | One design as an Instagram post, a story or an email header, downloadable as an image; "Give all my covers one look" as suggestions with Keep all; her own templates; blog post covers | Image export, new design kinds, a set restyle run |

Order: 1, 2, 3, 4, 5. Each stage gets its own implementation plan and ships on its own. The team
spec's rung 3 (the morning standup) and the other specialists follow the Designer.

## 9. Verification

- Backend:
  - the recipe validator, rejecting bad enums, lengths, hex values and foreign photo ids;
  - the design API and its tenant isolation;
  - Keep and Undo: History rows, the stale-undo refusal, restoring a plain photo;
  - `cover_design` in the course and event serializers;
  - in stage 2: `design_cover` (sources, exclusion of used photos, the generation allowance), the
    covers digest from fixtures, questions with choices, and the order of run events.
- Frontend (vitest):
  - each layout at the three sizes, keeping text inside the frame;
  - `CoverArt` choosing the nearest size;
  - the editor reducer with undo and redo;
  - in stage 2, the replay driver turning run events into an ordered script.
- e2e:
  - stage 1: design a cover by hand, Keep it, see it on the course page and in the site's courses
    section, then undo from History;
  - stage 2: a stubbed Designer turn builds a cover live and she keeps it, using the run stub
    pattern of `29-copilot`;
  - each new spec gets an `e2e/impact-map.json` entry.
- Every changed screen checked in the running dev stack at desktop and phone width, light and dark,
  including a look with portrait covers (atelier) and one with square covers (encore).

## 10. Risks

- **Stage 1 is large.** Mitigation: its plan may ship it in two halves (the editor and Keep first,
  then elements and photo edits) if the first half is useful alone.
- **Many cover slots change.** About 25 call sites across 21 looks pass `{ url: courseImage(c) }` to
  `Img`. Mitigation: most of the change is mechanical (`courseCover(c)`), `Img` falls back to
  today's photo, the slots that print their own words over the cover use the word-free mode (E15),
  and the looks are checked by screenshot.
- **Signed photo URLs expire after an hour** in a long studio session. Mitigation: refresh on a load
  error.
- **Generation:** the monthly count lives in Redis, so a flush resets it (existing behaviour).
  Generated photos join Pix4Less's public catalog (existing behaviour for `generate/`).
- **Dev runs the real Pix4Less service,** so generation in dev costs real credits. e2e uses fake
  mode.
- **A peer session built the run plumbing today.** Mitigation: stage 2 extends it rather than
  replacing it, and keeps its tests green.

## 11. Left to the builder

- the recipe's field names, and the exact geometry of each layout at each size;
- the container-query thresholds between sizes;
- the event shapes and the replay timings;
- the badge and shape styles;
- the wording of the Designer's prompt section and starters;
- whether `set_course_cover` and `set_event_cover` stay in the model's action list beside
  `design_cover`, or remain only for History rows already written;
- how the studio list page groups courses and events;
- splitting stage 1 into two shipments.

## 12. Open questions for the owner

None. The owner answered the two the builder check raised (E9 and E10: three shapes, drawn live;
E18: advanced editing on computers only). The calls marked "My call" in §3 (E11 to E17) are for the
owner to check while reading.
