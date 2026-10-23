# Native email: MailCraft's engine moves into Contentor

Date: 2026-10-22 · Owner request: "replace MailCraft with our own logic … it should feel really native" ·
The owner skipped the questions ("integrate it as native as possible, I will check it after it's completely
implemented"), so every product call below is mine (marked **call**) and open to change on review.

## Why

MailCraft is a separate product embedded through an iframe and a per-tenant API key. Because of that:
the team (copilot) cannot draft emails, nothing in the email knows her brand or catalog unless we ship it
across as "host context", every per-recipient render spends MailCraft quota, and the editor looks and
behaves like someone else's app. Contentor already owns everything an email needs (look, logo, catalog,
photos, the team), so the engine moves in.

## Goals

1. One email engine inside Contentor: block JSON → bulletproof table HTML (MailCraft's renderer, ported).
2. A native editor in the coach admin (no iframe): Contentor's UI kit, the site editor's interaction model
   (dnd-kit canvas, floating block toolbar, Tiptap text, link picker, photo library).
3. Branded by default: a live brand header (logo / name) and footer (name, site, socials, address,
   unsubscribe) and brand colour/font tokens, so a look or logo change re-skins every email.
4. Her content inside emails: an `item` block that shows a course, class/event, download, post or plan with
   its picture, words, price/date and link, resolved live at send time; links to her pages/content.
5. Templates made for her at setup (brand + niche), offered first when she writes an email.
6. The team can draft an email (copilot `draft_email`), and the Designer can design one from a brief or
   change one on request.
7. Student transactional emails (sign-in, receipts, …) and superadmin emails render on the same engine.
8. Contentor no longer calls MailCraft at runtime.

## Non-goals / anti-goals

- No open/click tracking, A/B tests, automations or new audience segments (existing filters stay).
- No raw-HTML block in the editor, no per-character colours/fonts (block-level style only).
- The MailCraft product itself is untouched; it keeps running for its own customers.
- Anti-goal: an email that looks fine in the editor and broken in Gmail. Everything that reaches an inbox
  is table HTML with inline CSS, PNG/JPEG images on stable https URLs (no SVG, no data: URIs, no AVIF,
  no signed links that expire).

## Design format (unchanged MailCraft JSON + three additions)

```
{ "version": 1,
  "settings": { backgroundColor, bodyBackgroundColor, contentWidth (600), bodyBorderRadius, defaultFont,
                defaultFontSize, defaultColor, backgroundStyle?, bodyBackgroundStyle? },
  "header": {"blocks": [...]}, "body": {"blocks": [...]}, "footer": {"blocks": [...]} }
```

Block types kept: text, heading, image, button, divider, spacer, columns (nested), social, hero, card, list,
profile, html (render-only, for imported templates). Keeping the format means imported MailCraft templates,
the transactional builder and MailCraft's AI schema all carry over.

Additions:

1. **Brand tokens** — any colour or font value may be a token instead of a literal:
   `brand:primary | primaryForeground | accent | accentForeground | background | surface | foreground |
   muted | border | inverse | inverseForeground` and `brand:heading | brand:body` for fonts. Resolved from the
   brand kit right before rendering (server) and when drawing the canvas (client). Literal hex keeps working.
2. **`brandHeader`** — `data: {variant: "logo" | "logoName" | "name" | "mark"}`,
   `style: {padding, alignment, backgroundColor, color, logoHeight}`. Draws her logo (stable URL) and/or name.
3. **`brandFooter`** — `data: {showSocial, showAddress, note}`, `style: {padding, alignment, backgroundColor,
   color, fontSize}`. Brand name · site link, social icons (hosted PNGs), her address when set, the note, and
   `Unsubscribe` (`{{UnsubscribeUrl}}`) on campaign emails.
4. **`item`** — `data: {ref, layout: "card" | "row" | "compact", showImage, showSummary, showMeta, buttonText}`,
   `style: {padding, backgroundColor, borderRadius, titleColor, textColor, buttonColor, buttonTextColor}`.
   `ref` is a catalog id (`course:12`, `live:5`, `onsite:3`, `stream:2`, `zoom:4`, `download:7`, `post:9`,
   `plan:2`, `page:about`) or a live slot (`next:event`, `latest:course`, `latest:post`, `latest:download`).
   Resolved at render from the database; a ref that no longer resolves drops the block (with a warning).

Links may be site-relative (`/courses/x`); the renderer makes them absolute on her site, so emails follow a
custom domain. Merge variables: `{{FirstName}}`, `{{Name}}` (fallback "there"), `{{UnsubscribeUrl}}`.

**Call:** lucide icons in card/list blocks (SVG data URIs, invisible in Gmail/Outlook) render as their
emoji/text fallback; social icons become hosted PNGs.

## Brand kit

`GET /api/v1/email/brand/` → `{name, site, host, logo, mark, colors{token→hex}, fonts{heading, body}, radius,
socials[{network, url}], address}` — one function (`email_campaigns.brand.kit`) shared by campaigns,
transactional emails and the editor. Colours come from her look + palette (oklch → hex), fonts are
email-safe stacks (`SERIF_FONTS` fallback rule from `context.py`), the mark is `{site}/pwa-icon?size=192`,
the logo is her uploaded/studio logo through the stable image route.

## Stable images

Tenant storage is private (1-hour presigned links), and her own photos are AVIF. **Call:** a public route
`GET /api/v1/email/i/<signed token>` streams an email-safe copy (JPEG, or PNG when transparent, ≤1200 px,
MailCraft's `email_safe`) of a tenant object; the copy is made on first request and kept under the tenant's
`email/` prefix. The token signs the source key (no enumeration) and the key must belong to the host's
tenant. The editor turns a library pick into such a URL via `POST /api/v1/email/images/ {photo_id}`.

## Data model (tenant schema, `apps.email_campaigns`)

- `EmailTemplate`: name, category (newsletter · launch · event · note · offer · welcome · other), design,
  subject, preheader, source (starter · designer · coach · imported), timestamps.
- `EmailCampaign` gains: `design`, `preheader`, `template` (FK, where it started), status `draft`,
  `updated_at`; `template_id` (MailCraft id) stays blank-able for old rows; `recipient_filter` defaults
  to `{"type": "all"}`.
- `EmailDesignJob`: a Designer run on a campaign or template (brief, mode new|edit, block_id, status
  queued|working|done|failed, step line, warnings, error).

Public schema (`apps.platform_email`): `PlatformEmailTemplate` and the same campaign fields.

## API (`/api/v1/email/`, coach or owner)

| Route | What |
|---|---|
| `brand/` | the kit |
| `catalog/` | her items (+ live slots resolved) for the item block and pickers |
| `images/` POST | photo id → stable image URL |
| `i/<token>` GET | the image (public, no auth) |
| `templates/` GET/POST, `templates/<id>/` GET/PATCH/DELETE, `templates/<id>/duplicate/` | templates (list carries a rendered preview) |
| `campaigns/` GET/POST, `campaigns/<id>/` GET/PATCH/DELETE | drafts + history (POST creates a draft from a template or blank) |
| `campaigns/<id>/send/` | send now or schedule a draft |
| `campaigns/<id>/test/` | send it to herself |
| `campaigns/<id>/recipients/` | delivery trail (unchanged) |
| `render/` POST | design → `{html, text, warnings}` (preview) |
| `designer/` POST, `designer/<job>/` GET | start / follow a Designer run |

Removed: `setup/`, `session/`, `gallery/`, `templates/copy/`, `templates/preview/`, the MailCraft key
provisioning. `send/` (by MailCraft template id) is replaced by `campaigns/<id>/send/`.

## Sending

The send task resolves and renders the campaign **once** (tokens, items, links), then personalises the HTML
per recipient (`{{FirstName}}`, `{{UnsubscribeUrl}}`, values HTML-escaped) and sends through Resend with a
plain-text part and List-Unsubscribe headers. Quota, scheduling, exactly-once claim and the recipient trail
stay as they are. **Call:** campaigns send from her mailbox identity (`sending_identity`) like her
transactional emails, so replies reach her inbox.

## The editor (packages/shared/src/email/editor, used by both admins)

- Layout at `lg`+: block palette (left) · canvas (center, the email at its width on a backdrop, header /
  body / footer visibly grouped) · settings (right: the selected block, or the email's settings). Below `lg`
  the canvas stacks over a panel switcher.
- Interaction copied from the site editor: hover outline, click to select, floating toolbar (drag handle,
  name, duplicate, delete with confirm), drop zones, palette drag sources, undo/redo with coalesced typing,
  Delete / ⌘Z / ⇧⌘Z.
- Text: inline Tiptap (bold, italic, underline, link, lists, `{{FirstName}}` insert). Headings and button
  labels edit inline.
- Colours: brand swatches first (writing tokens), then a custom hex. Fonts: brand heading/body, then
  email-safe stacks.
- Pickers are injected by the app: `pickImage`, `pickLink`, `pickItem`; preview HTML comes from `render/`.
- Props: `value`, `onChange`, `syncKey` (an outside change, e.g. the Designer finishing, replaces the
  design as one undoable step), `kit`, `items`, `features {items, brand}`.

## Coach flow (frontend-customer)

- **Messages → Design an email** (`/admin/messages/email/new`): her templates first (setup starters on
  top), "Ask the Designer" (a brief, optional items to feature), "Blank". Any choice creates a draft and
  opens the editor. `?template=<id>` and `?recipient=<id>` keep working.
- **Editor** (`/admin/messages/email/<id>/edit`): subject + preview text, autosave, Preview
  (desktop/mobile), Send test, "Ask the Designer…" bar (whole email, or the selected block), Save as
  template, Next → **Send** (`…/send`: audience with live count, now or later, final preview).
- Drafts show in the Messages list; a sent campaign keeps its detail page.
- **Templates** (`/admin/messages/email/templates`): grid with previews; use, edit, duplicate, delete,
  "Ask the Designer for a new template".

## The team

- **Copilot `draft_email`** (Marketing Specialist; Community manager co-signs, like announcements): the
  model writes subject, preview text, heading, body, items to feature and a button; applying it lays that
  content out in one of her templates (the template's own heading/text/button styles are reused) as a
  draft. Undo deletes the untouched draft. Her templates are listed in the user turn so it can pick one.
- **The Designer** (`designer.py`, MailCraft's pipeline on `apps.core.ai.structured`): new email from a
  brief, or ops on an existing one (whole or selected block). Images come from her photos (`photo://id`),
  her items (`item://ref`) or the catalog (`stock://<aspect>/<words>` → `auto_cover`, search only, no
  generation); links only to her items/pages. Untrusted text is fenced as data. Runs on the agents queue;
  the editor follows the run's step line.

## Templates made at setup

**Call:** deterministic recipes, not an AI run, so they exist instantly, cost nothing and never fail:
Newsletter, Launch (when she sells something), Class invite (when she runs live/in-person sessions),
Personal note. They use brand tokens (so later look changes follow), her brand header/footer in the
`email_style` she picked (letter · branded · bold), her own words from the interview (pitch, teaches,
outcome) and catalog, her site's photos (hero, covers; no paid calls) and live item slots
(`next:event`, `latest:course`). Built by the `emails:starters` interview milestone, and lazily the first
time an existing coach opens her email templates.

## Transactional and platform emails

- `notifications.transactional.render` renders its block JSON natively (no MailCraft key, no render quota);
  `brand_kit` moves into `email_campaigns.brand`.
- Superadmin (`platform_email`, frontend-main): the same editor and send path with the Contentor kit;
  no catalog, no AI, no starters.

## Migration off MailCraft

Done on prod on 2026-10-23: a one-off `manage.py import_mailcraft_templates` copied the templates coaches
(and the platform) made in MailCraft into `EmailTemplate` (source `imported`); MailCraft's stock gallery
copies (`template_type` "provided") and empty ones stayed behind. The command, `TenantConfig.emailcraft_api_key`,
`PlatformEmailConfig` and the `EMAILCRAFT_*` settings were then removed.

## Build order

1. Engine: renderer port + tests, brand kit + tokens, items, stable images.
2. Models, API, send task on the engine; transactional on the engine.
3. Editor (shared) + coach pages (start, editor, send, templates, Messages list).
4. Designer pipeline + editor bar; copilot `draft_email`.
5. Setup starters (milestone + lazy).
6. Platform side; MailCraft import command; remove MailCraft code paths.
7. Tests (backend, vitest, new e2e spec), lint/typecheck, commit, deploy, verify.
