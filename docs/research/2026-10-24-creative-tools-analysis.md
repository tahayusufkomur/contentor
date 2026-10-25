# Creative tools: what to bring into Contentor

Analysis, 2026-10-24. The owner's question: coaches already use creativity tools; which of them
would be easiest to bring into Contentor and give the most benefit?

Status: recommendation only. Nothing is built or scheduled, effort figures are estimates, and none
of it is in `docs/PRODUCT.md`'s backlog yet.

Follow-up, 2026-10-25: which Canva features to build into the photo studio ("Canva in the photo
studio" below).

## Short answer

Don't integrate the big tools. Build the small part of their jobs that ends inside Contentor
anyway, from pieces that already exist. Captions and transcripts have the best benefit for the
effort, and the next items build on them.

## What creators use

- ChatGPT is the most-named creator tool, with CapCut, Canva and Midjourney next (Collectively
  creator survey; small sample, method not described).
- Canva reported more than 265 million monthly users and 31 million paying users in 2025.
- Adobe's Creators' Toolkit Report (October 2025, more than 16,000 creators in eight countries):
  86% use creative generative AI, and 85% would turn to an AI agent that learns their creative
  style. That is the pitch of the studio's AI specialists.
- No reliable survey of course creators alone was found. Course-creation guides recommend Canva
  for design and Descript for editing video through its transcript.

## What Contentor already covers

| Job                     | Typical outside tool         | In Contentor                                                   |
| ----------------------- | ---------------------------- | -------------------------------------------------------------- |
| Writing                 | ChatGPT, Claude              | Copilot, blog AI with autopilot, `draft_email`                 |
| Photos and AI images    | Midjourney, Canva            | Pix4Less search and generation (`apps/core/curated_images`)    |
| Logos                   | Canva, Looka                 | Logo Studio                                                    |
| Email design            | Mailchimp, Kit, Canva        | Native email engine (`apps.email_campaigns`)                   |
| Site design             | Squarespace, Wix             | Looks and site styles                                          |
| Covers                  | Canva                        | Designer stage 1: the `Design` model and the cover renderer    |
| Live video              | Zoom, StreamYard             | LiveCraft, with recordings                                     |
| Whiteboard              | Miro, Excalidraw             | Excalidraw in LiveCraft rooms (in progress on 2026-10-24)      |

The gaps are video work (captions, repurposing, recording) and promo graphics.

## Build, in this order

| #   | Job (tool used today)                                   | What exists                                                               | What to add                                                                                     | Effort           |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Captions and transcripts (Descript, CapCut auto-captions) | `courses.Video`, a native `<video>` player, the LiveCraft `recording.ready` webhook | A Celery task per upload or recording: speech to text, captions in the player, the transcript under the lesson | 2–3 days         |
| 2   | Turning a video into posts and emails (ChatGPT, Opus Clip) | Copilot `draft_email`, blog AI, the Marketing specialist                  | Feed the transcript in: a blog post, an email, social captions, the best 30–60 s moments        | 1–2 days after 1 |
| 3   | Promo graphics for each launch (Canva)                  | The cover renderer with the coach's fonts, colours and logo; the browser sidecar | Post, portrait and story sizes; "Download PNG"                                           | 2–4 days         |
| 4   | Recording lessons (Loom)                                | Multipart upload, the lesson video picker                                 | A screen or camera recorder in the browser that saves into the lesson                           | 3–4 days         |

### 1. Captions and transcripts

- Exists:
  - `Video` (`s3_key`, `duration_seconds`) in `backend/apps/courses/models.py`.
  - A native `<video>` element in `frontend-customer/src/components/student/video-player.tsx`, so
    captions are one `<track kind="captions">`.
  - `livecraft_webhook` in `backend/apps/live/webhooks.py` receives `recording.ready` and stores the
    S3 key in `recording_url` on `LiveClass` or `LiveStream`. No `Video` row is made for a recording.
  - `apps/core/ai.py` sends text and gets text or structured output back; it has no audio input.
- Add: a task on upload completion and on `recording.ready`. A presigned URL goes to a
  speech-to-text service; WebVTT and plain text are stored with the video; the player gets the
  track; the lesson page shows the transcript.
- Provider: a speech-to-text API that takes a URL and returns WebVTT needs no download and no
  ffmpeg (no image has ffmpeg today). Gemini is already wired (`AI_PROVIDER=gemini`), but large
  files need its Files API and its timestamps are coarser.
- Cost: about $0.003 a minute with OpenAI's gpt-4o-mini-transcribe (third-party price list), so
  about $2 per 10 hours of video, once.
- Why: students get captions and a lesson they can read and search. The transcript is the raw
  material for item 2 and for the student Site assistant (`docs/PRODUCT.md`, Next: "AI assistants
  & governance").

### 2. Turning a video into posts and emails

- Exists: the copilot's `draft_email`, the blog AI with autopilot, and the Marketing specialist
  (`backend/apps/core/copilot/team.py`).
- Add: "Turn this video into…" on a lesson or a replay. The transcript goes through those doors: a
  blog post draft, an email draft, three social captions, and the best 30–60 s moments with start
  and end times.
- No video rendering: the coach cuts the clips in CapCut.
- This is what Kajabi's Creator Studio sold, minus the clip rendering (see "Don't integrate").

### 3. Promo graphics

- Exists:
  - Designer stage 1: `Design` in `backend/apps/media/models.py`, the recipe in
    `backend/apps/media/design_recipe.py` (sizes `card`, `wide`, `banner`) and the renderer
    `frontend-customer/src/components/covers/cover-art.tsx`.
  - The browser sidecar `infra/browser/server.mjs`: `POST /capture {url, width, theme?, cookies?}`
    returns a screenshot. The final visual check already uses it.
- Add: post (1:1), portrait (4:5) and story (9:16) shapes, and "Download PNG" through the sidecar.
- Most of the effort is layout per shape: the title clamp numbers in
  `frontend-customer/src/lib/covers/clamp.ts` are per font and were measured in Chrome only.
- Roadmap: this is stage 5 ("Sizes and sets") of
  `docs/superpowers/specs/2026-10-17-designer-end-to-end-design.md`, planned after stage 4
  (decorations, rotation, tint). Recommendation: move the sizes-and-download slice ahead of stage 4.
  Every course or event launch needs a post, and each post links back to the coach's site.

### 4. Recording lessons in the browser

- Exists: `backend/apps/core/uploads/multipart.py`, the `Video` model and
  `frontend-customer/src/components/admin/video-picker.tsx`.
- Add: screen and mic, or camera and mic, with `getDisplayMedia`/`getUserMedia` and
  `MediaRecorder`. Chunks stream into the multipart upload and the video lands in the lesson.
  Option: the Content Creating specialist's lesson outline as a teleprompter.
- Why: `GO_LIVE_RULE` in `backend/apps/courses/models.py` lets a lesson go live with a video or
  the coach's own text, and video is the harder of the two to make. No vendor, no running cost.
- Limits: phones can't capture the screen. A camera bubble over the screen needs canvas
  compositing (1–2 more days). Recent Chrome and Safari record MP4; check the browser matrix
  before building.

## Later

- Branded PDF workbooks and lead magnets (Canva documents): the copilot writes, the coach's look
  styles it, the sidecar prints it. Needs a print-to-PDF endpoint beside `/capture`. Feeds the
  downloads kind and list growth. 4–6 days.
- Touching up the coach's own photos (background removal, cleanup) with an image-editing model.
  Pairs with the per-style photo treatment (`2fc3af85`). About 2 days, plus a cost per image.
- AI voice and dubbing (ElevenLabs): only once Contentor sells beyond English. It costs per minute
  and needs the speaker's consent.

## Don't integrate

- Canva Connect ("Edit in Canva"): needs OAuth and Canva's review, and apps that rely on preview
  APIs can't pass public review. Template Autofill is reported as Enterprise-only (third-party
  sources). The gain over "download from Canva, upload here" is small. Revisit if coaches keep
  asking.
- Adobe Express Embed SDK: no charge today, but access needs Adobe's business approval and Adobe
  says that may change. Coaches must sign in with an Adobe ID to save or export; Adobe staff said
  in 2024 that a full no-login workflow won't be generally available. It would put Adobe's editor
  inside the studio, beside the Designer the owner chose to build (Designer spec, decision E3).
- Opus Clip-style automatic clips: Opus offers its API only on a custom-priced Business plan, and
  building it means rendering and reframing video with ffmpeg on the two mini PCs. Kajabi's Creator
  Studio (clips, transcripts, written content, embedded Adobe Express) is a paid add-on that Kajabi
  sunsets on 2026-11-09, the clearest warning against the heavy version.
- CapCut: no official API, and a third-party review reports that its terms forbid automation. A
  video exported from CapCut is an ordinary upload.
- Descript API: in beta. Imports and AI edits spend the coach's own Descript media minutes and
  credits, so it only helps coaches who already pay for Descript.

## Canva in the photo studio

Follow-up, 2026-10-25. The owner's question: give coaches a photo studio that feels like Canva, with
the best Canva features that are easy to add.

Built the same night (A, B and C; commits `2240a425` and `8ae5a963`, not deployed). Where the build
differs from the plan below:

- B1–B3 (extend, take out, change) call Gemini 3.1 Flash Image from Contentor on `GEMINI_API_KEY`, as
  the logo marks do, not through a new Pix4Less endpoint. Her photos never leave her own storage for a
  public catalog, and nothing waits on a Pix4Less deploy. Edits run at 2K (`PHOTO_EDIT_SIZE`), about
  $0.10 each.
- B4 runs IS-Net (Apache-2.0), not BiRefNet: on CPU, even BiRefNet's lite model was killed at 6 GB,
  while IS-Net takes 3–5 s and ~1.5 GB at its peak. The service is our own image (`infra/cutout`),
  because rembg's image has no arm64 build.
- C1 uses `SITE_QA_BROWSER_URL`, the same browser sidecar as the visual check.

### Short answer

Build them into the photo studio (`/admin/studio`); don't embed Canva. Most of what makes Canva feel
like a studio is CSS on the renderer the studio already has (`CoverArt`). Canva's best photo tools
(Magic Expand, Magic Eraser, Magic Edit) need one new Pix4Less endpoint on the image model Pix4Less
already calls. Background Remover needs a small sidecar with no cost per image. Canva's 2026
headline, Canva AI 2.0, is designing by conversation, which is the Designer's job (Designer stage 2).

### What the studio has today

Designer stage 1 (shipped 2026-10-18) and focus mode's cover step:

- Layouts: six, plus "Your set". Focus mode's covers job drafts four styles on one photo
  (`backend/apps/core/focus/covers.py`).
- Photos: hers, the Pix4Less library, and new AI photos (20 a month per site).
- Text: label, title, subtitle and extra lines in the look's two fonts, with weight, case, size,
  letter and line spacing, colour and alignment.
- Elements: badges ("New", "Next date", "Live", her words) and four shapes (rectangle, circle, arch,
  line).
- Brand: the look's palette by role, a custom hex, her logo in white, black or its own colours.
- Photo: focus, zoom, brightness, contrast, saturation, darken.
- Canvas: move, resize, nudge, duplicate (⌘D), delete, forward and back, undo and redo. Layers snap
  to the canvas's edges and centre.
- One design in three shapes: Card, Wide and Banner. No image file, so no download yet.

### A. Studio kit: renderer and toolbar only

| #   | Feature                                     | Canva                                | Add                                                                                                                                         | Effort     |
| --- | ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A1  | One-tap photo filters, with "Match my site" | Filters, Adjust                      | The site's five photo grades (none, mono, soft, tint, vivid) as filters on the cover photo, her look's own first; warmth and blur sliders   | 1 day      |
| A2  | Duotone in her colours                      | Duotone                              | Two more grades: the photo in her main colour or in her accent                                                                              | 0.5 day    |
| A3  | Text effects                                | Effects: Shadow, Outline, Background | Shadow, outline, a colour band behind each line, and one word of the title in the accent colour                                             | 1–1.5 days |
| A4  | Photo frames                                | Frames                               | The photo in a rounded, circle, arch or blob mask; flip                                                                                     | 0.5–1 day  |
| A5  | Icons and stickers                          | Elements                             | An icon layer from `lucide-react` (already installed) in a palette colour; burst, star, arrow and pill shapes for "Free" or "Starts Monday" | 1–1.5 days |
| A6  | Smart guides                                | Alignment guides                     | Snap to the other layers' edges and centres as well                                                                                         | 0.5 day    |
| A7  | Colours from the photo                      | Photo colours in the colour picker   | Swatches from the photo's own colours; the focus set from where its subject sits                                                            | 1 day      |

- A1: the grades live in `PHOTO_TREATMENTS` (`frontend-customer/src/lib/site-styles.ts`). A designed
  cover is kept out of the site's grade on purpose (the `[data-site-img-frame]` rule in
  `frontend-customer/src/styles/globals.css`), so on a graded look (mono, tint) a cover's photo can
  look out of place beside the site's other photos. "Match my site" fixes that and follows a look
  change, as her palette colours do (E17).
- A2 reuses the `tint` grade's tint layer, with her colour.
- A3: the colour band pads each line, so the per-font title clamps in
  `frontend-customer/src/lib/covers/clamp.ts` need a check. Shadow, outline and colour leave the text's
  size alone.
- A6: `snap` in `frontend-customer/src/lib/covers/geometry.ts` already takes a list of guides.
- A7: Pix4Less returns each photo's colours (swatches, palette, lightness, contrast, warmth) and
  `subject_placement`. `_image_from_payload` in `backend/apps/core/curated_images/client.py` keeps
  colours only for logos, and the studio uses neither. This one needs the backend too.
- Each feature is a recipe field: the validator (`backend/apps/media/design_recipe.py`) and its
  mirrors (`frontend-customer/src/types/design.ts`, `src/lib/covers/recipe.ts`), `CoverArt`, and a
  toolbar control. Every cover slot on every look then draws it, with no running cost.

### B. Magic photo tools

| #   | Feature                                  | Canva                     | Add                                                                                             | Effort                                      |
| --- | ---------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| B1  | Extend a photo to fit the shape          | Magic Expand              | Grow a photo to the Wide, Banner or story shape                                                 | 4–5 days for B1–B3: 2–3 in Pix4Less, 2 here |
| B2  | Remove something from a photo            | Magic Eraser              | "Remove the coffee cup", typed, no brush                                                        | (with B1)                                   |
| B3  | Change something in a photo              | Magic Edit                | "Make it golden hour", "a calm beach behind me"                                                 | (with B1)                                   |
| B4  | Background remover, "you on your colour" | Background Remover (paid) | Her figure cut out as a new photo, and a cutout layout: her colour behind her, the title beside | 2–3 days                                    |
| B5  | Suggest words                            | Magic Write               | Three suggestions for the label, title or subtitle, from the item's description and outline     | 0.5–1 day                                   |
| B6  | Four styles                              | Magic Design              | "Show me four styles" in the studio: focus mode's covers job, run from there                    | 1 day                                       |

- B1–B3 share one endpoint. Pix4Less already calls Gemini 3.1 Flash Image
  (`src/lib/generation/gemini-api.ts` in the pix4less repo), which edits a picture from a sentence;
  the call sends only text today. Add the photo as an image part beside the text and run it as a
  generation request, so Contentor polls it as it polls `generate/`. Her own photos are already in
  her Pix4Less private space and library photos have a Pix4Less id, so the edit can name the photo
  by id instead of uploading it.
- B1 matters most to Contentor: every cover is drawn as Card, Wide and Banner (3:1), and coaches'
  own photos are often portrait phone shots.
- Each edit makes a new photo in her Media and keeps the original. It counts against the 20 new
  photos a month (E12) and costs about $0.07 per 1K image at Google's list price.
- Privacy: generated images join Pix4Less's public catalog today. An edit of her own photo must stay
  in her private space.
- B4: Gemini can't return transparency, so cutouts need a segmentation model. rembg (MIT) serves one
  over HTTP (`rembg s --no-ui`) and fits as an internal sidecar beside `browser`. Its CPU image is
  about 1.6 GB, and models download separately. Use `birefnet-portrait` or `isnet-general-use`, not
  `bria-rmbg`, whose licence needs a paid agreement for commercial use. `own_photos` keeps an RGBA
  photo's transparency in its AVIF, so the cutout goes through the normal Media pipeline. Dev needs
  a fake or an on-demand start, given the Docker VM's RAM.
- B5 and B6 are the Designer's own work. If Designer stage 2 (`design_cover`) comes next, build them
  inside it.

### C. Out of the studio (item 3 above)

| #   | Feature              | Canva        | Add                                                                                    | Effort   |
| --- | -------------------- | ------------ | -------------------------------------------------------------------------------------- | -------- |
| C1  | Download PNG and JPG | Download     | Draw the design in the browser sidecar at the size she picks                           | 1–2 days |
| C2  | Social sizes         | Magic Resize | Post (1:1), portrait (4:5), story (9:16); Wide doubles as a 1280×720 YouTube thumbnail | 2 days   |
| C3  | QR code              | QR codes     | A QR layer for an onsite class's poster ("Scan to book")                               | 0.5 day  |

Until C1 exists, nothing she makes can leave Contentor, so every social use waits for it.

### Later

- Several photos in one design (grids, before and after). The recipe holds one photo. 2–3 days.
- Moving the subject and filling the gap (Magic Grab): B2 and B4 together.
- Curved text; rotation (Designer stage 4); a layers panel with drag to reorder (`@dnd-kit` is
  installed), lock, group and multi-select.
- More fonts than the look's two (E11).
- Course certificates. Course-creation guides make them in Canva, and Contentor has none: a design
  kind with the student's name, the course and the date, printed to PDF by the sidecar. Needs course
  completion first. 3–5 days.
- Mockups: her cover on a laptop, phone or book for a sales page.
- "Give all my covers one look" (Designer stage 5).

### Skip

- Animation and video, real-time collaboration and comments, print and merchandise: Designer
  non-goals.
- Scheduling posts to Instagram or TikTok: each needs the platform's app review.
- Words drawn inside AI images: Designer non-goal, since text stays an editable layer.
- Charts, docs, whiteboards and presentations: not cover work.

### Order

1. A1–A4, about 3–4 days: the photo and text tools coaches reach for first, no running cost, and
   every cover on her site gains them at once. Then A5–A7.
2. C1–C2: the download every social use needs.
3. B4, then B1–B3: the cutout first (free per image, the classic coach thumbnail), then the three
   paid edits.
4. B5 and B6 inside Designer stage 2.

## Against the north star

Through `/po`'s lens (shortest path to the first paying coach), none of this outranks the Now list
in `docs/PRODUCT.md`: deploy main, push, go live on Stripe. Items 3 and 4 come closest, since they
help a coach make and promote a first product.

## Re-check before building

- Vendor terms move: Canva Connect eligibility and review rules, Adobe's Embed SDK access and
  price.
- The speech-to-text price above comes from a third-party list; Gemini's audio rate is on
  ai.google.dev/pricing.
- Kajabi's sunset date is from Kajabi's help centre as read on 2026-10-24.
- Gemini 3.1 Flash Image's price per image (B1–B3) comes from a search summary of Google's price
  page on 2026-10-25, and the model was still marked preview in places.
- The licence of each rembg model (B4) is on its own model card; rembg's MIT licence doesn't cover
  the weights.

## Sources

- Canva 2025 figures: https://techcrunch.com/2026/02/18/canva-gets-to-4b-in-revenue-as-llm-referral-traffic-rises/
- Adobe Creators' Toolkit Report: https://news.adobe.com/news/2025/10/adobe-max-2025-creators-survey
- Creator AI tools survey (Collectively): https://collectivelyinc.com/blog/industry-insights/industry-insights-how-content-creators-are-embracing-generative-ai-and-ai-avatars-insights-from-our-latest-survey
- Course-creation tools guide: https://schoolmaker.com/blog/course-creation-tools
- Kajabi Creator Studio sunset: https://help.kajabi.com/articles/marketing/creator-studio/creator-studio
- Adobe Express Embed SDK FAQ (sign-in): https://developer.adobe.com/express/embed-sdk/docs/guides/troubleshooting/faq/
- Adobe staff on no-login: https://community.adobe.com/t5/adobe-express-embed-sdk-discussions/bypass-login-for-adobe-express/m-p/13663686
- Canva Connect docs: https://www.canva.dev/docs/connect/
- Canva return navigation: https://www.canva.dev/docs/connect/return-navigation-guide/
- OpusClip pricing: https://opus.pro/pricing
- CapCut API status: https://www.wireflow.ai/blog/capcut-api
- Descript API (beta): https://help.descript.com/hc/en-us/articles/43370311322509-Descript-API-beta
- Transcription pricing: https://invertedstone.com/calculators/whisper-pricing
- Canva Magic Studio features reviewed: https://fast.io/resources/canva-ai-review-2026/
- Canva Create 2026 (Canva AI 2.0): https://yoursocial.team/blog/canva-create-2026-updates
- Certificates made in Canva: https://www.ruzuku.com/learn/tools/canva/create-course-certificates
- Gemini image pricing: https://ai.google.dev/pricing
- rembg (server mode, models, licences): https://github.com/danielgatis/rembg
