# Four languages: Contentor in English, Turkish, German and Polish

Date: 2026-10-28 · Owner request: "I want to have a support for multiple languages. Polish, Turkish, German,
English … one contentor app can be one language, so they also need to have content in the same language." ·
Owner on the play-back: "Everything in their native language … Sounds perfect, just deeply plan it for now."
Product calls that are mine are marked **call** and open to change on review. Facts marked *(measured)* were
checked against the code or live services on 2026-10-28.

## Why

A creator who doesn't work in English can't use Contentor today: the marketing site, signup, the setup
interview, the Creator studio, their students' site, every email and everything the AI writes is English.
Turkish existed once and was removed on 2026-10-04 (`0886b80c`) together with the Turkish region, iyzico and
the `tr.` subdomain. This time there are no regions and no second payment provider: language is its own thing,
and Stripe Connect stays for everyone.

## What the owner decided

1. Four languages: English (`en`), Turkish (`tr`), German (`de`), Polish (`pl`).
2. **Everything in the creator's language**, from landing on contentor.app until their first student signs up.
3. **One site, one language.** A creator with an English audience and a Turkish one runs two sites (one
   creator can already own several sites under one email). Each site's content is in that site's language.
4. A new site's language defaults to the language the creator was using on contentor.app; they can pick
   another.
5. Stripe Connect for everyone. No iyzico, no regional subdomains. Payments for creators based in Turkey are a
   separate, later project.

Confirmed on the play-back:

6. contentor.app: the browser language decides a first visit, a switcher changes it, and each language has
   its own address (`contentor.app/tr`, `/de`, `/pl`).
7. **The Creator studio follows the creator, not the site.** A Turkish creator managing their English site sees
   the studio in Turkish. Only what students see follows the site.
8. A student sees the site's language everywhere, whatever their browser says.
9. A site's language is fixed once it is live.
10. The superadmin panel stays English.
11. Interface translations are drafted with AI; the owner checks Turkish, native speakers check German and
    Polish.

## Goals

1. A creator can go from contentor.app/tr to a live Turkish site and a first Turkish student without meeting
   one English word (same for German and Polish).
2. Every AI-written word lands in the right language: the site's language for anything students read, the
   creator's language for anything said to the creator.
3. Adding a fifth language later is translation work plus one line in a list, not engineering.
4. New features stay translatable: the checks in `make lint` stop English from leaking back in.

## Non-goals

- Translating a creator's content between their sites ("make a Turkish copy of my English site"). It's the
  natural follow-up, built on this.
- Several languages inside one site, or a language switcher on creator sites.
- Right-to-left scripts and any language beyond the four.
- Payments for creators based in Turkey (Stripe Connect doesn't onboard Turkish accounts), and any notice
  about it.
- Local-currency plan prices (PLN, TRY).
- Translating the superadmin panel (`frontend-main /admin`) and Django admin.
- Translating what creators and students write themselves (posts, messages, announcements, course text).

## Anti-goals

- **An English word on a Turkish site.** A button, an email footer, a "Mon" in a calendar, an error toast, an
  alt text. The creator's customers see it, so it is the failure that matters most. Most of the guards below
  exist for this.
- Interface text that reads as machine-translated: the glossary and the human review gate exist for this.
- A long-lived "i18n branch". Other sessions edit these files daily, so the work lands on `main` in small
  per-area commits, hidden behind a per-language switch until each language is ready.

## The two languages in play

Two settings, already in the data model:

- **Site language**: `TenantConfig.default_locale`, one per site.
- **Creator language**: `User.preferred_locale` on the creator's public and tenant user rows. A student's value
  is not used.

| What | Language |
|------|----------|
| contentor.app: landing, pricing, blog, signup, login, dashboard ("your sites") | the URL's language (switcher) |
| Platform emails to creators: verify, sign-in, setup reminders, trial and billing, Stripe plan receipts | creator |
| `/setup`: the interview's screens and the team's messages | creator |
| The Creator studio: every `/admin` screen, editors' chrome, copilot chat, help bot, site check findings, toasts, errors, push to the creator | creator |
| Inside an editor canvas or preview: site editor, email preview, course page preview | site |
| Anything AI writes for students: pages, courses, outlines, posts, emails, captions, reel hooks, SEO text, alt text | site |
| The public site, student area, sign-in, checkout, PWA install prompts, push to students | site |
| Emails to students: transactional, campaign footers, the unsubscribe page, reminders | site |
| The student assistant (`student_bot`) | site |
| A live room (LiveCraft) | site for students, creator for the host (**call**: each join link carries its own language) |
| Superadmin, Django admin | English |
| Image and logo searches sent to Pix4Less | English (the catalog is described in English) |

What the creator writes is never translated by us.

## Data model

- `apps.core.constants.LOCALE_CHOICES` → `en, tr, de, pl`, read from the one locale list (see Staying
  extensible), with `settings.LANGUAGES` to match. Both fields are already `max_length=2` and every existing
  row is `en`, so there is no data migration beyond the choices.
- `ENABLED_LOCALES` (env, default `en`): the languages offered to the public. A language that isn't enabled
  is fully built and testable in dev, and hidden in prod until its review is done. Both frontends read the
  same list. A row holding a language that isn't enabled resolves to English everywhere.
- A missing message (which the lint check should already stop) falls back to the English text and is logged,
  never shown as a raw key.
- `TenantConfig.default_locale` = the site language. It is set at provisioning from signup and can change
  until go-live. Changing it before go-live redraws everything the AI already drafted for that site: pages,
  starters and the first post (the scoped redraft exists).
  After go-live the creator API refuses a change; the superadmin tenant page can still change it, with a
  warning that existing content stays as written. **call**
- `User.preferred_locale` = the creator language. `update_locale` (`apps/accounts/views.py`) accepts the four
  languages and writes both of the creator's rows (public + every tenant they own), plus the `user-locale`
  cookie.
- Platform blog posts (`/api/v1/platform/blog/`) get a `language`. Each language's blog lists only its own
  posts, and the Blog link is hidden in a language that has none yet. **call**
- Platform email campaigns (superadmin → creators) get an audience filter by creator language: one campaign
  per language. **call**

## How the language reaches each layer

### contentor.app (`frontend-main`)

- next-intl routing with `localePrefix: "as-needed"`: English stays at `/`, the others live at `/tr`, `/de`
  and `/pl`. The marketing pages, pricing, blog, signup, login, verify, callback and dashboard move under
  `app/[locale]/`. Superadmin `/admin` stays outside the locale segment, in English.
- First visit: the browser's `Accept-Language` picks the prefix. A switcher choice is remembered in a cookie.
  English browsers and search bots get `/`.
- A switcher in the header and footer shows each language in its own name: English, Türkçe, Deutsch, Polski.
- SEO: `hreflang` alternates and `x-default` on every page, a sitemap with alternates, translated metadata
  and OG text, `og:locale`.
- `tr.contentor.app` is still in the Cloudflare load balancer from the old region. It 301s to
  `contentor.app/tr`. **call**
- Signup takes the page language as the creator language. A "Site language" field defaults to it and can be
  changed. A creator who signs in lands on their dashboard in their creator language, and each site on the
  dashboard shows its language. **call**

### The coach app (`frontend-customer`)

- `src/i18n/request.ts` resolves the language per route. `/admin/**` and `/setup/**` use the creator language
  (the `user-locale` cookie, which mirrors `User.preferred_locale`). Everything else uses the site language,
  read from the tenant config the layout already fetches with `X-Tenant-Domain`.
- Editor canvases and previews sit inside a nested `NextIntlClientProvider` carrying the site language and
  the site namespaces, so a block renders in the site language inside an admin page.
- `<html lang>` follows the page's main content: the site language on public pages, the creator language in
  the studio.
- The studio's settings get a language picker, which calls `update_locale`.
- The site's metadata, `og:locale`, `sitemap.ts`, `robots.ts` and `llms.txt` use the site language.

### Shared package (`packages/shared`)

Nothing in it is translated today *(measured: 56 `.tsx` files, 0 use translations)*. Shared components call
`useTranslations()`. Their messages live in `packages/shared/messages/<lang>/`, and both apps' `request.ts`
load them. The namespaces are split by who reads them: `site.*` for the section blocks and anything students
see, and `studio.*` for the email editor, admin kit, logo and video tools.

### Backend (Django)

- Django gettext with `.po` files in `backend/locale/<lang>/LC_MESSAGES/`. `apps.core.i18n_helpers.msg()`
  already outgrew its own "~50 entries, then migrate to .po" note, so it moves onto gettext. Django and DRF
  ship their own `tr`, `de` and `pl` messages.
- Inside a request: the frontends' API client sends `Accept-Language: <page language>` (server-side fetches
  too), and `LocaleMiddleware` is already installed.
- Outside a request (Celery, beat, emails, AI): explicit `translation.override(...)` through two helpers,
  `site_language(tenant)` and `creator_language(user)`. Never rely on whatever language is active in a task.
- Fixed copy that becomes translatable:
  - API error details (~230)
  - the setup interview's fixed copy and fallback questions (`interview_brief`, `interview`,
    `interview_team`, `setup_flow`, `wizard_catalog`, `onboarding/compose.COPY`, whose `_t(locale)` already
    exists)
  - email starters, built-in announcement templates, transactional emails, recovery emails and platform emails
  - the site check's creator-facing findings, and focus and logo defaults
- Stored text shown to the creator (audit trail entries, system-made notifications) is either rendered at
  read time from a key plus parameters, or written in the creator language when it is created. The builder
  audits which applies where.

### AI writing

*(measured: 37 backend modules call the model; `ai_compose`, `ai_curate` and `starter_post` already have a
language slot hard-wired to "English")*

- `ai.structured`, `structured_stream`, `structured_messages`, `stream_text` and `agentc_look` take a
  **required** `language` keyword. A call site that hasn't decided fails its tests, so nothing silently
  defaults to English. The value is a locale (the language rule is added to the system prompt), or `None` for
  calls whose output no person reads (judges, classifiers). **call**
- One helper builds the rule, along the lines of "Write every word the reader sees in Turkish. Keep brand
  names and the creator's own words as written." The plan carries the table classifying all 37 call sites as
  *for students* (site language), *to the creator* (creator language), or *mixed*.
- Mixed calls: the setup interview and the copilot talk to the creator in the creator language and write
  site copy in the site language, so their prompts carry both.
- Pix4Less: queries are always English. The curate step already turns the creator's words into a query, and
  it also translates them. Logo searches stay `"<subject> logo"` in English. Pix4Less descriptions are English,
  so alt text and captions are written in the site language before they are saved.
- Reels and captions are already language-aware (transcript language, Turkish dotted/dotless upper-casing,
  caption translation). The defaults move to the site language: the translation target, the hook-cover text,
  and the transcription hint sent to Scribe.
- Site visual check (`site_qa`): its review adds "every visible word is in <site language>". A leak is a
  finding: content goes to the copilot, interface text is logged as `site-qa: open finding`.
- Models: no change. Turkish and Polish quality is proven with the eval below, not assumed.

### Formatting and typography

- Dates, times, numbers and money go through next-intl's formatter or `Intl` with the active locale. The 21
  hard-coded `"en-US"`/`"en-GB"` uses go *(measured)*. Calendars and date pickers start the week on Monday in
  `tr`, `de` and `pl`.
- Plurals and word order use ICU messages. Polish needs `one`/`few`/`many`/`other`, so no sentence is glued
  from pieces and no `n === 1 ? "x" : "xs"` survives.
- Turkish case: CSS `text-transform` is correct once `lang` is right. The 28 JS `toUpperCase()` calls that
  touch words *(measured)* become `toLocaleUpperCase(locale)`.
- German runs about 30% longer: nav, tabs, buttons and cards must wrap or truncate gracefully, and headings
  get `hyphens: auto`. This is checked with German screenshots at phone width.
- Fonts:
  - Turkish ş ğ İ and Polish ą ę ł ś ż ź ć ń need the `latin-ext` subset; German ä ö ü ß are in `latin`.
  - All 45 site-style Google Fonts include `latin-ext` *(measured)*, and the css2 API serves it on its own.
  - Fixes: `/setup`'s `next/font` loads only `subsets: ["latin"]`, and the logo export
    (`lib/logo/brand-kit.ts`) loads Fontsource `latin-*` files, so a Turkish or Polish brand name in an
    exported logo draws with missing glyphs. Both add `latin-ext`.
  - To verify: the reels caption font lookup with Turkish and Polish text, and Geist in both apps.
- Slugs and subdomains:
  - Django `slugify` drops letters *(measured: "Işık Yoga" → `isk-yoga`, "Łódź Pilates" → `odz-pilates`,
    "Straße Fitness" → `strae-fitness`, "Gülşen Çağrı" → `gulsen-cagr`)*.
  - One transliterating slugify replaces it everywhere (site name and subdomain, onboarding, filters, focus
    posts, courses): ı/İ→i, ğ→g, ş→s, ç→c, ö→o, ü→u, ä→a, ß→ss, ł→l, ą→a, ę→e, ś→s, ź/ż→z, ć→c, ń→n,
    ó→o. **call**: one table, not per-language rules.
  - Existing slugs never change.

### Emails

- Students get the site language: every transactional email, campaign footers, the unsubscribe page,
  built-in announcement templates, and class reminders (dates in the site locale and the student's time
  zone). `brand.py` already puts the site language in the email's `lang`.
- Email starters made at setup are written in the site language.
- Creators get the creator language: platform emails, setup recovery emails, and superadmin campaigns (one per
  language, see the data model).
- Stripe:
  - Checkout `locale` is the site language for student purchases and the creator language for plan
    checkout. The provider already takes a locale; `_SUPPORTED_STRIPE_LOCALES` gains `tr`, `de` and `pl`.
  - Each Stripe customer's `preferred_locales` is set, so Stripe's own receipts and invoices follow.
  - Connect onboarding is hosted by Stripe and follows the creator's browser.

### Live classes (LiveCraft, sibling repo `../livecraft`)

LiveCraft's room UI has no translations today *(measured)*. It gets the four languages and a `lang` on each
join request. `apps.live.livecraft.join_url` passes the site language for a student and the creator language
for the host. Without this, students meet an English room, so it is in scope and comes last.

### PWA and push

The manifest's name stays the site's brand. Its description, `lang` and the install prompts (`pwa.json`) use
the site language. Push notifications go to students in the site language and to the creator in the creator
language.

## The translation workflow (keeps working after launch)

- English is the source. Messages live in `frontend-main/messages/<lang>/`,
  `frontend-customer/messages/<lang>/`, `packages/shared/messages/<lang>/` and `backend/locale/<lang>/`.
- A glossary file (`i18n/glossary.json`) holds the canonical terms per language and the voice rules
  (informal address: du, ty, sen; see the owner decisions). It carries `docs/GLOSSARY.md`'s copy rules into every language: the user
  is a **creator** and never a coach or teacher, their area is the **Creator studio**, and they build a
  **platform**, never a school. Plus course, download, live class, membership, look, and so on.
- `make translate` finds keys missing or changed in `tr`/`de`/`pl` (frontend JSON and backend `.po`), drafts
  them through the AI layer with the glossary, writes them, and marks them unreviewed (`.po` fuzzy flag; for
  JSON, a review list beside the files). A developer or agent runs it; CI does not.
- `make translate-export LANG=pl` and `make translate-import` exchange a CSV (key, English, translation,
  where it shows), so a non-developer reviewer can work in a spreadsheet. **call**
- Two new `make lint` checks, in the `scripts/check-*.mjs` pattern:
  1. **Completeness**: every English key exists in every enabled language, and the placeholder and ICU
     arguments match.
  2. **Hard-coded string ratchet**: a baseline of literal UI strings per file. A file's count may only go
     down, and new files start at zero. Extraction can land area by area while other sessions keep shipping,
     and new English stops leaking in. It reads the code's syntax tree, not regexes (see Staying
     extensible).
- A language goes into prod's `ENABLED_LOCALES` when its review is done.

## Staying extensible

Agents write most new code here, several features a day, so "remember to translate" isn't a plan. Each guard
below runs in a gate that already runs (`make lint`, `make typecheck`, the test suite), so a forgotten string
fails before it ships.

**Adding a string** (the everyday case):

| What must be true | What enforces it |
|-------------------|------------------|
| The text goes through `t()` (frontend) or gettext (backend) | The ratchet. The frontend half reads the TypeScript syntax tree: JSX text, user-facing props (`label`, `placeholder`, `title`, `aria-label`, `loadingText`…) and toast calls. The backend half uses Python's `ast` to find literal `detail`/`error` values, `ValidationError` messages, and copy in the email and interview modules. TypeScript and `ast` are already installed, so there are no new dependencies. **call** |
| The key exists in English and is spelled right | Typed messages: next-intl's `AppConfig` is typed from the English JSON, so a missing or misspelled key fails `make typecheck`. |
| The key exists in every enabled language | The completeness check. Its failure says "run `make translate`". |
| The translation still matches the English | Each drafted translation stores a hash of the English it came from. When the English changes, `make translate` drafts it again and puts it back in the review queue. |
| A person checks it eventually | AI drafts ship marked unreviewed. `make translate-export` gives reviewers only the unreviewed and changed ones. |
| AI output is in the right language | The required `language` keyword on the AI entry points. |

- Agents learn the rules from a short "Text and languages" section in `CLAUDE.md` and `AGENTS.md`, next to the
  loading conventions it mirrors. The section explains how to name keys, where to put them, how to write ICU
  plurals, and that `make translate` follows a new string.
- Backend `.po` files are compiled to `.mo` in the Django image build (and by `make translate` in dev), so a
  deploy can't ship stale translations.
- Pages don't get heavier as strings grow. Messages are split into namespaces by route, each route loads only
  its own, and the client gets only the namespaces its components use. A student page never ships studio
  strings.

**Adding a language:**

- **One locale list**, `i18n/locales.json`, holds each language's code, its name in its own language, the font
  subsets it needs and its Stripe Checkout locale. The backend (`LOCALE_CHOICES`, `LANGUAGES`) and both
  frontends read it, and a test fails if a locale list is hard-coded anywhere else. **call**
- Then: add its glossary entry, run `make translate LANG=xx` (which drafts every key), review, and add it to
  `ENABLED_LOCALES`. The choices change is a one-line Django migration.
- A test checks that every site-style font covers the subsets each listed language needs, so a language
  whose letters a font lacks fails before launch, not on a creator's site.
- Plurals, dates and numbers come from CLDR through ICU and `Intl`, so no code is written per language.
- How far "add a line" goes:
  - **Another Latin-script language** (Spanish, French, Italian, Dutch, Portuguese…): data and review only.
  - **A non-Latin script** (Greek, Cyrillic): also needs fonts that cover it (the font test lists the gaps)
    and slug transliteration beyond the one table.
  - **Right-to-left** (Arabic, Hebrew): mirrored layouts make it a project of its own, outside this design.

## Scale *(measured)*

| Where | Files | Already translated | Literal-string lines |
|-------|-------|--------------------|----------------------|
| `frontend-customer` | 725 `.tsx` | 125 | ~1,500 in ~376 files |
| `frontend-main` | 114 `.tsx` | 20 | ~140 in 36 files (landing copy is partly in `marketing.json`) |
| `packages/shared` | 56 `.tsx` | 0 | ~300 in 26 files |
| backend | — | — | ~230 API error strings + fixed copy in ~20 modules |

That comes to roughly 3,000–4,000 English strings, each needed in three more languages. Extracting them is
mechanical bulk work, so it goes to agy in per-area batches (the gemini-executor rule). Claude reviews each
batch, and each batch is its own commit on `main`.

## Build order

Every phase lands on `main` and stays hidden until its language is enabled.

0. **Foundations**:
   - the one locale list (`i18n/locales.json`) and `ENABLED_LOCALES`
   - backend gettext, `Accept-Language` from the API client, the override helpers, and `.mo` compiled in
     the image
   - next-intl in both apps with typed messages, route-split namespaces, and the shared package's messages
   - `<html lang>`, fonts and the font-subset test, the transliterating slugify, locale formatting (the
     `en-US` removals)
   - the two lint checks (both halves of the ratchet), `make translate` with source hashes, and the glossary
   - the "Text and languages" section in `CLAUDE.md` and `AGENTS.md`
1. **Students see the site's language**: the public site and section blocks, the student area, sign-in,
   checkout locale, the PWA, student emails and notifications, the unsubscribe page, and the editor-canvas
   provider. Proof: flip a scratch tenant to `tr` and walk the student path.
2. **AI writes in the right language**: the required `language` keyword, the 37 call sites classified,
   English Pix4Less queries, alt text, and the language check in `site_qa`. Proof: `make eval-sites` with
   Turkish and Polish briefs.
3. **contentor.app in four languages**: `[locale]` routing, the switcher, SEO, signup with a site language,
   the dashboard, platform emails to creators, the blog per language, the `tr.` redirect, and Stripe locales.
4. **The Creator studio and `/setup` in the creator's language**:
   - `/setup`, every `/admin` screen, and the shared editors (email, logo, video, admin kit)
   - backend error messages and the setup interview's fixed copy
   - creator push and emails, the studio language picker, and the site-language lock after go-live
5. **LiveCraft rooms** in four languages (sibling repo), plus `lang` on join.
6. **Translation pass and review**: AI drafts for everything, the owner's Turkish review, and native German
   and Polish reviews. Each language is switched on in prod as its review ends.

**call**: students first, because a leak there embarrasses the creator in front of their customers, and AI
second, because generated content is most of what students read. After phase 0, phases 1–5 depend little on
each other and touch different files, so they can run in parallel sessions. The machine still allows only
one test run at a time.

## Testing

- **Unit**:
  - completeness and ratchet checks
  - slugify with the measured cases above
  - `language` required on the AI entry points
  - `site_language` / `creator_language` in Celery tasks
  - each transactional email rendered in `tr`, `de` and `pl`, with no English template strings in it
- **E2e**: one new spec, `site-in-turkish`:
  1. Sign up on `contentor.app/tr`, run `/setup`, go live.
  2. A student signs up and receives a Turkish sign-in email (email sink).
  3. **Leak detector**: on the key pages, no value from the English `site.*` messages appears in the visible
     text. Short or ambiguous values (e.g. "OK") are excluded.

  The spec gets an `e2e/impact-map.json` entry.
- **Visual**: German screenshots at phone width of the busiest screens (nav, pricing cards, studio tabs)
  through the browser sidecar.
- **Content quality**: `make eval-sites` with one Turkish and one Polish brief, judged in that language.

## Rollout

- English stays the default, and the 18 prod tenants and their creators stay `en`. Nothing changes for them
  except fixed bugs such as slugs and fonts.
- Turkish is switched on first, since the owner reviews it; German and Polish follow their native review.
  **call**

## Owner decisions on review (2026-10-28)

1. **Voice: informal everywhere**: du (German), ty (Polish), sen (Turkish). This holds for the interface and
   for AI-written copy, and the glossary carries it.
2. **Plan prices stay EUR and USD**: EUR inside the eurozone, USD elsewhere (so Polish and Turkish creators pay
   in USD). No pricing change in this project; local currencies can come later, since `PLAN_AMOUNTS` is
   already per currency.
3. **Turkish launches without waiting for Turkish payments, and with no notice.** Stripe's own onboarding
   refuses accounts based in Turkey, and nothing extra is built for that here.

## Flagged, outside this project

- **Legal pages**: contentor.app's footer links for Privacy and Terms point to `#`. Before marketing in
  Germany and Poland, contentor.app needs a privacy policy and terms (and an Impressum for Germany). A German
  creator's site also needs an Impressum and a privacy page, and possibly cookie consent. This is a separate
  project, but it blocks a German launch.
- **Who reviews German and Polish**: the owner to find native reviewers before phase 6.

## Left to the builder

- The exact namespace split and message file layout.
- Whether `i18n_helpers.msg()` stays as a thin wrapper over gettext or its callers move to gettext directly.
- How stored creator-facing text (audit trail, notifications) is made translatable, case by case.
- Which surfaces need layout changes for German length, found by the screenshots.
