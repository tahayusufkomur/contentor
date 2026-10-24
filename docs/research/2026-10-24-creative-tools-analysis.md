# Creative tools: what to bring into Contentor

Analysis, 2026-10-24. The owner's question: coaches already use creativity tools; which of them
would be easiest to bring into Contentor and give the most benefit?

Status: recommendation only. Nothing is built or scheduled, effort figures are estimates, and none
of it is in `docs/PRODUCT.md`'s backlog yet.

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
