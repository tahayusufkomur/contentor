# Four Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One task = one fresh agent (see "Execution protocol").

**Goal:** Contentor in English, Turkish, German and Polish. Everything students see follows the site's language, and everything said to the creator follows the creator's language. Each language stays hidden in prod until its review is done.

**Architecture:**
- **One locale list.** `packages/shared/src/i18n/locales.json` feeds both Next apps directly and Django through a synced copy.
  - `ENABLED_LOCALES` decides what the public sees.
  - Any other value resolves to English.
- **Two languages per request.**
  - Backend: one middleware picks the language.
    - Creator roles get the creator language.
    - Anyone else on a site gets the site language.
    - contentor.app gets the page's language.
  - Celery tasks, emails and AI calls choose explicitly with `translation.override(...)`.
  - Frontends: `request.ts` resolves per route. `/admin` and `/setup` follow the creator; everything else follows the site.
- **Where text lives.**
  - Interface text: next-intl JSON (both apps and the shared package) and gettext `.po` (backend).
  - AI: the five `apps.core.ai` entry points take a required `language=`, which appends one rule to the system prompt.
- **Guards.** `make lint` gains three checks:
  - a completeness check;
  - a hard-coded-string ratchet, reading the TypeScript syntax tree and Python `ast`;
  - the AI `language=` check.

  `make translate` drafts missing text with the glossary and marks it unreviewed.

**Tech Stack:**
- Backend: Django 5.1 gettext (`.po` compiled to `.mo`; GNU gettext added to the image), DRF and Celery.
- Frontends: next-intl 4.11 on Next 14.2 (both apps).
- Checks: the TypeScript compiler API, resolved from `frontend-customer/node_modules`, and Python `ast`.
- Translation tooling: `polib`, dev only.
- Tests: Playwright.
- LiveCraft: Next 16 with `Intl.PluralRules`; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-28-four-languages-design.md`.
- Its table "The two languages in play" decides the language of every surface.
- Read "Staying extensible" before Phase 0.
- Line numbers below are as of `b8a63142` (2026-10-28). Re-find them by symbol when they have moved.

## Global Constraints

- **Locales**, exactly:
  - `en` English;
  - `tr` Türkçe;
  - `de` Deutsch;
  - `pl` Polski.

  English is the source and the default.
- **`ENABLED_LOCALES`.**
  - Env var. Prod default: `en`. Dev `.env` and test settings: `en,tr,de,pl`.
  - A value that is not enabled resolves to `en` everywhere: `languages.resolve` in the backend, `resolveLocale` in the frontends.
- **Which language applies:**
  - Site language = `TenantConfig.default_locale`.
  - Creator language = `User.preferred_locale`. A student's value is never used.
  - The superadmin panel (frontend-main `/admin`, Django admin) stays English.
- **What is never translated:**
  - Pix4Less queries, photo briefs and image prompts are English.
  - What creators and students write themselves.
- **Voice:** informal everywhere, in the interface and in AI copy: `du` (de), `ty` (pl), `sen` (tr).
- **Glossary** (`docs/GLOSSARY.md`):
  - **creator**, never coach, teacher, instructor or admin;
  - the **Creator studio**;
  - their **platform**, never school;
  - a **live session**, never live class;
  - course, download, membership.
- **A missing message** shows the English text and logs `i18n: missing <locale> <key>` once. Never a raw key.
- **What must not change:**
  - Existing slugs.
  - The 18 prod tenants and their creators stay `en`.
- **Commits:**
  - No long-lived branch. Every task lands on `main` in its own commits, hidden behind `ENABLED_LOCALES`.
  - The checkout is shared. On 2026-10-28 peers were mid-edit in `interview*.py`, `setup-flow/*`, `signup-form.tsx` and `accounts/tokens.py`.
    - Stage only your own files, by path. Never revert or format files you did not change.
    - Run `pre-commit run --files <your files>`, then `git commit --no-verify`.
    - Rebase onto `main` before each commit in a file a peer touches.
- **Running checks:**
  - Backend tests from an agent shell: `docker compose exec -T django pytest <path> -n auto -q`. After a new migration, run `make test-fresh` once.
  - Frontend tests: `cd frontend-<app> && npx vitest run <path>`. Vitest only picks up `src/**/__tests__/**/*.test.ts`.
  - `make typecheck` runs inside the Next containers.
- **Heavy jobs:** one at a time (full suite, e2e, image build). Run `pgrep -fl 'playwright test'` before any e2e run.
- **Target language in Make:** `TO=` (see Calls).

## Review Focus

1. **A student whose browser is English, on a Turkish site.** Every error toast, date and empty state must be Turkish; the browser's `Accept-Language` must never win. Tests:
   - Task 0.2 `test_student_gets_site_language_whatever_the_browser`;
   - Task 1.7 runs its browser context with `locale: "en-US"`.
2. **A Celery worker that ran a Turkish job, then an English one.** The second job must write English. Test: Task 0.1 `test_task_starts_in_english_after_a_turkish_task`.
3. **A cached AI answer or look sample reused in another language.** The help bot, student bot and look-copy caches must key on the language. Test: Task 2.2 `test_cache_key_carries_language`, parametrized over the three.
4. **A site whose language is not enabled,** for example the superadmin set `pl` before Polish ships. It must render English on both front and back end, with nothing mixed. Tests:
   - Task 0.1 `test_resolve`;
   - Task 0.2 `test_hidden_language_answers_english`;
   - Task 0.3 `config.test.ts`.
5. **A site found by recomputing its slug from a stored name.** `site_name.token_tenant` resolves a legacy token by `slugify(brand_name)`. Under the new slugify, "Işık Yoga" no longer gives the `isk-yoga` that the old one stored. Test: Task 0.8 `test_legacy_token_finds_a_site_named_with_the_old_slug`.

## Calls this plan makes beyond the spec

- **The backend picks a request's language itself,** instead of every fetch sending `Accept-Language`.
  - Why: 106 raw `fetch` calls bypass the two API wrappers, and browsers send their own language. A German browser would get German errors on a Turkish site.
  - Creator roles (`owner`, `coach`) get the creator language: the `user-locale` cookie, else their row.
  - Anyone else on a site gets the site language.
  - contentor.app gets the page's language: the `NEXT_LOCALE` cookie, else `Accept-Language`.
  - Django admin and the superadmin API answer in English.
  - `LocaleMiddleware` goes.
- **The locale list and glossary live in `packages/shared/src/i18n/`,** not in a root `i18n/`.
  - Why: the Django image only sees `./backend`, and the Next images only copy `packages/` plus their own app.
  - `make sections-sync` copies both files into `backend/apps/core/i18n/`, and `make lint` fails on drift. This is how the section manifest already works.
- **Namespaces by reader:**
  - `site` and `studio` are shared files (`packages/shared/src/i18n/messages/<lang>/`).
    - `site` holds everything a visitor or student sees, including the section kits that live in frontend-customer and the editor placeholders inside blocks. The spec puts a canvas in the site language.
    - `studio` holds the creator-facing shared components.
  - `admin`, `student`, `pwa` and `common` stay in frontend-customer.
- **`settings.LANGUAGES` holds only the enabled languages,** so Django never answers in a hidden one. `LOCALE_CHOICES` holds all four.
- **The completeness check covers every listed language, not only the enabled ones.** Drafts never fall behind. `ENABLED_LOCALES` only decides what the public sees.
- **Review state:**
  - `.po` files use gettext's own:
    - `make translate` drafts with the `fuzzy` flag;
    - the image compiles with `--use-fuzzy`, so drafts ship;
    - a changed English string arrives as a new untranslated msgid.
  - JSON uses `<messages root>/<lang>.review.json`: `{key: {src: <first 8 hex of sha1(English)>, reviewed: bool}}`.
- **`polib` joins `requirements/dev.txt`** for `make translate` and `i18n_check`. Reading and writing `.po` files with plurals and contexts is not a few lines. Prod never installs it.
- **`TO=`, not `LANG=`.**
  - `LANG` is the shell's locale variable.
  - Overriding it in Make exports `LANG=pl` to Python, and Python's output encoding breaks on "Türkçe".
- **Scribe gets no language.**
  - Its `language` field forces the transcript language (`scribe/worker.py:83`); it is not a hint. A video spoken in another language would come back garbled.
  - Captions keep auto-detect.
  - The caption translation target and the hook text default to the site language.
- **The creator's words become English search terms here.**
  - The spec assumed the curate step translates them. It only joins them, and `subject_of` drops non-ASCII letters.
  - One cached model call, `english_terms`, translates them before setup's Pix4Less queries.
  - A search the creator types in the media library goes as typed. Pix4Less has translated queries server-side since 2026-08.
- **Student time zones are not stored.** Student emails keep the site's zone and its label, in the site's locale.
- **"Fixed once live" means "went live once":** `Tenant.is_published` or `setup_flow.completed_at`. Go-live stamps the second, so hiding the site later doesn't unlock it.
- **The AI rule goes at the end of `system`.** That gives one cached prompt per feature and language. The note in `ai.py:25-28` changes from "byte-frozen per feature" to "per feature and language".
- **The student bot and the help bot stop mirroring the user's language.** The student bot uses the site language, the help bot the creator's (spec).
- **Stripe `preferred_locales`** is set from the Checkout Session's `metadata.locale` in the `checkout.session.completed` webhooks. Contentor never creates Stripe customers itself.
- **Not done:**
  - The old Turkish files are not restored: the English moved on (coach → creator). The parity script and language switcher deleted in `0886b80c` are reused as starting points (`git show 0886b80c^:<path>`).
  - Native `<input type="date">` pickers follow the browser's language.
  - `help_kb.md` stays English; the help bot answers in the creator's language.
  - The service worker's "Notification" fallback stays; every payload carries a title.

## Execution protocol

- **Order:**
  1. Phase 0 in task order (0.6–0.8 may run in any order after 0.5).
  2. Phases 1–5 in parallel sessions; they touch different files. Inside a phase, task order.
  3. Phase 6 last.

  Only one agent runs tests, builds or e2e at a time. Read-only work can overlap.
- **Dispatch.** One fresh agent per task, given:
  - this plan's header, Global Constraints and Calls;
  - the task;
  - the recipes (extraction tasks);
  - the spec;
  - the wiki page the task names.
- **Bulk extraction goes to agy.** The batches marked **agy** follow the gemini-executor rule:
  - the task text plus the recipe is the brief;
  - Claude reviews every batch against the recipe's checklist before its commit;
  - never re-brief more than once; take over after that.
- **Review.** A fresh reviewer checks each task's diff against its Interfaces and tests before the next task starts.
- **Done means:**
  - the task's tests pass;
  - `make lint` passes;
  - for extraction tasks, the ratchet count is 0 for every file the task names.

## Recipes

**Frontend extraction** (Tasks 1.1, 1.2, 3.3, 4.5):
1. **Namespace by reader:**
   - visitors and students, including placeholders inside blocks: `site.<area>.<key>`;
   - the student area: `student.*`;
   - studio pages and owner tools: `admin.*`;
   - creator-facing shared components: `studio.*`;
   - contentor.app: `marketing`, `pricing`, `auth`, `common`, or a new namespace per route.
2. **Keys by meaning:** `emptyCourses`, not `noPublishedCoursesYet`. A repeated placeholder shares one key, e.g. `site.placeholder.heading`.
3. **Counts and variables** use ICU, e.g. `"{count, plural, one {# course} other {# courses}}"`.
   - Never glue sentence pieces together.
   - Never write `n === 1 ? …`.
4. **Dates, numbers and money** go through `useFormatter()` / `getFormatter()` or the `lib/format.ts` helpers with the active locale. Never `"en-US"`, never `undefined`.
5. **Upper-casing words:** CSS `uppercase`, or `toLocaleUpperCase(locale)`.
6. **After each batch:**
   - `node scripts/check-i18n.mjs --update` to lower the baseline;
   - `make translate`;
   - vitest for the touched directories;
   - `make lint`, which includes the typecheck.
7. **Review checklist:**
   - no counted literal left in the named files;
   - the namespace matches the reader;
   - ICU for every count;
   - no key reused for two meanings;
   - the English UI is unchanged (spot-check two screens).

**Backend extraction** (Tasks 1.4, 1.5, 4.3, 4.4, 4.6):
1. **Which function:** `gettext as _`; `gettext_lazy` at module level; `ngettext` for counts; `pgettext` for short ambiguous words.
2. **Arguments:** literals only, with `%(name)s` placeholders, e.g. `_("Welcome to %(brand)s") % {"brand": brand}`. No f-strings inside `_()`.
3. **Outside a request** (tasks, emails, AI, beat), wrap the work:
   - `with translation.override(site_language()):` for students;
   - `with translation.override(creator_language(user)):` for the creator.
4. **After each batch:**
   - `make translate`;
   - `docker compose exec -T django python manage.py i18n_check --update`;
   - the app's tests.
5. **Leak test pattern:** `translated(msgid)` from `apps/core/tests/i18n_utils.py` (Task 0.2). It returns the Turkish msgstr and fails when that is still English. Assert that the output equals it.

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `packages/shared/src/i18n/locales.json` (new) | The one locale list | 0.1 |
| `packages/shared/src/i18n/locales.ts` (new) | `resolveLocale`, `enabledLocales`, names | 0.3 |
| `packages/shared/src/i18n/glossary.json` (new) | Terms and voice per language | 0.4 |
| `packages/shared/src/i18n/messages/<lang>/{site,studio}.json` (new) | The shared namespaces | 0.3, 1.1, 1.2, 4.5 |
| `packages/shared/src/i18n/site-preview.tsx` (new) | The site language inside studio previews | 1.3 |
| `packages/shared/src/i18n/font-subsets.json` (new) | Google Fonts subsets per family | 0.7 |
| `backend/apps/core/i18n/{locales,glossary,baseline}.json` (new) | Synced copies; the backend ratchet baseline | 0.1, 0.4, 0.5 |
| `backend/apps/core/languages.py` (new) | `resolve`, `site_language`, `creator_language`, `Mixed`, `rule` | 0.1, 0.4, 2.1 |
| `backend/apps/core/middleware/language.py` (new) | The request's language | 0.2 |
| `backend/apps/core/slugs.py` (new) | Transliterating `slugify` | 0.8 |
| `backend/apps/core/management/commands/translate.py` (new) | Drafts, `.po` refresh, review export/import | 0.4 |
| `backend/apps/core/management/commands/i18n_check.py` (new) | The backend lint | 0.5, 0.8, 2.1 |
| `backend/locale/<lang>/LC_MESSAGES/django.po` (new) | Backend translations | 0.2 onward |
| `scripts/check-i18n.mjs`, `scripts/i18n-baseline.json` (new) | The frontend lint | 0.5 |
| `scripts/translate.py` (new) | `make translate*` | 0.4 |
| `frontend-customer/src/i18n/{config,request,surface}.ts` | Per-route resolution | 0.3 |
| `frontend-main/src/i18n/{routing,navigation,request}.ts`, `src/middleware.ts` (new) | `[locale]` routing | 3.1 |
| `backend/apps/tenant_config/site_language.py` (new) | Lock, change, redraft | 4.2 |
| `e2e/specs/43-site-in-turkish.spec.ts`, `e2e/helpers/leaks.ts` (new) | The proof | 1.7, 4.7 |
| `../livecraft/src/lib/i18n.ts`, `../livecraft/messages/<lang>/room.json` (new) | Live rooms | 5.1 |

---

## Phase 0: Foundations

### Task 0.1: One locale list, `ENABLED_LOCALES` and the backend helpers

Budget: 60 min. Wiki: `docs/wiki/core-platform-multi-tenancy-config.md`.

**Files:**
- Create: `packages/shared/src/i18n/locales.json`
- Create: `backend/apps/core/i18n/locales.json`, a synced copy
- Create: `backend/apps/core/languages.py`
- Modify:
  - `scripts/sync_sections.py`: also copies `packages/shared/src/i18n/locales.json` to `backend/apps/core/i18n/` (Task 0.4 adds `glossary.json`). `--check` covers both; no other file in that directory is touched.
  - `backend/apps/core/constants.py:10-11` (`LOCALE_CHOICES` from the JSON)
  - `backend/config/settings/base.py:197-202`
  - `backend/config/settings/test.py` (all four enabled)
  - `backend/config/celery.py`
  - `.env.example` and `.env.prod.example` (document `ENABLED_LOCALES`); your local `.env` gets `ENABLED_LOCALES=en,tr,de,pl`
- Create (with `makemigrations`): migrations in `backend/apps/accounts/migrations/` and `backend/apps/tenant_config/migrations/`, choices only
- Test: `backend/apps/core/tests/test_languages.py`

**Interfaces:**
- Produces `locales.json`, exactly:
  ```json
  {"default": "en", "locales": [
    {"code": "en", "name": "English", "native": "English", "subsets": ["latin"], "stripe": "en", "og": "en_US"},
    {"code": "tr", "name": "Turkish", "native": "Türkçe", "subsets": ["latin", "latin-ext"], "stripe": "tr", "og": "tr_TR"},
    {"code": "de", "name": "German", "native": "Deutsch", "subsets": ["latin"], "stripe": "de", "og": "de_DE"},
    {"code": "pl", "name": "Polish", "native": "Polski", "subsets": ["latin", "latin-ext"], "stripe": "pl", "og": "pl_PL"}]}
  ```
- Produces `apps.core.languages`:
  - constants: `CODES: tuple[str, ...]`, `DEFAULT = "en"`, `CREATOR_ROLES = ("owner", "coach")`;
  - `info(code: str) -> dict`: the list entry;
  - `enabled() -> tuple[str, ...]`;
  - `resolve(code: str | None) -> str`: the code when it is enabled, else `"en"`;
  - `site_language(tenant=None) -> str`: the current schema's `TenantConfig.default_locale`, or `tenant`'s through `schema_context`. In the public schema it is `DEFAULT`. Always resolved.
  - `creator_language(user=None) -> str`: `resolve(user.preferred_locale)`. With `user=None` it uses the current tenant's owner (role `owner`, lowest id); with no owner, `DEFAULT`.
- Produces settings:
  - `ENABLED_LOCALES: list[str]`, always starting with `"en"`; an unknown code raises `ImproperlyConfigured`. Parsed by `_env_locales()` beside `_env_bool` (`base.py:429`).
  - `LANGUAGES`: the enabled pairs only.
- Produces Celery: a `task_prerun` handler calls `translation.activate(settings.LANGUAGE_CODE)`.

- [ ] **Step 1: Write the failing tests.**

```python
def test_the_list():
    assert languages.CODES == ("en", "tr", "de", "pl")
    assert dict(LOCALE_CHOICES)["pl"] == "Polish"

@override_settings(ENABLED_LOCALES=["en", "tr"])
def test_resolve():
    assert [languages.resolve(c) for c in ("tr", "de", "xx", None, "")] == ["tr", "en", "en", "en", "en"]

def test_site_language_follows_the_tenant_config(tenant_ctx): ...      # default_locale "tr" → "tr"; with ENABLED_LOCALES=["en"] → "en"
def test_site_language_in_the_public_schema_is_english(): ...
def test_creator_language_reads_the_row_then_the_owner(tenant_ctx): ...  # owner with "de" → creator_language() == "de"; a "" row → "en"
def test_task_starts_in_english_after_a_turkish_task():
    translation.activate("tr")
    task_prerun.send(sender=None, task_id="t", task=None)
    assert translation.get_language() == "en"
def test_env_locales():
    assert _env_locales("tr, de") == ["en", "tr", "de"]
    with pytest.raises(ImproperlyConfigured): _env_locales("xx")
```

- [ ] **Step 2: Run them and see them fail.**
  - Command: `docker compose exec -T django pytest apps/core/tests/test_languages.py -q`.
  - Expected: ImportError on `apps.core.languages`.
- [ ] **Step 3: Implement.**
  - The JSON and the sync.
  - `constants.LOCALE_CHOICES` and `settings.LANGUAGES` read the synced JSON with `json` and `pathlib`. Leave `LOCALE_EN` and `REGION_DEFAULT_LOCALE` alone for now; Tasks 3.3, 3.4 and 4.1 retire them.
  - `languages.py`, the Celery signal and `makemigrations accounts tenant_config`.
- [ ] **Step 4: Run the tests (PASS).** Then `make test-fresh` once for the new migrations.
- [ ] **Step 5: Run `python3 scripts/sync_sections.py --check`.** Expected: OK.
- [ ] **Step 6: Commit** with the message "feat(i18n): one locale list feeds Django; ENABLED_LOCALES hides unfinished languages".

### Task 0.2: Backend gettext and the request's language

Budget: 90 min. Wiki: `docs/wiki/authentication-accounts.md`, `docs/wiki/core-platform-multi-tenancy-apps.md`.

**Files:**
- Modify:
  - `backend/Dockerfile`:
    - apt-get install `gettext`;
    - after `COPY . .`, run `RUN django-admin compilemessages --use-fuzzy`.
  - `.gitignore` (`backend/locale/**/*.mo`)
  - `backend/conftest.py`: compile `.mo` once on the xdist controller before any worker starts, never concurrently.
  - `backend/config/settings/base.py:81`: replace `LocaleMiddleware`.
  - `backend/apps/accounts/authentication.py`: add `session_claims`.
- Create:
  - `backend/locale/{tr,de,pl}/LC_MESSAGES/django.po` (`makemessages -l tr -l de -l pl --add-location=file --no-obsolete`)
  - `backend/apps/core/middleware/language.py`
  - `backend/apps/core/tests/i18n_utils.py`
- Delete `backend/apps/core/i18n_helpers.py`. Move its 27 `msg()` calls to gettext:
  - `accounts/views.py`: `:90, :150, :153, :171, :246, :250, :359`;
  - `core/onboarding/views.py`: `:86, :105, :116, :121, :153, :181, :190, :202, :357, :361, :367, :470, :475, :499, :503, :509`;
  - `core/onboarding/recovery.py`: `:253, :257, :262, :265`.
  - `site_name.name_problem`'s keys become `PROBLEMS: dict[str, Promise]` of `gettext_lazy` beside it.
- Test: `backend/apps/core/tests/test_request_language.py`

**Interfaces:**
- Produces `apps.accounts.authentication.session_claims(request) -> dict | None`:
  - looks for the token in the `Authorization: Bearer` header, then the `contentor_access_token` cookie;
  - decodes it HS256 with `SECRET_KEY`;
  - no DB access; `None` when the token is missing or invalid.
- Produces `apps.core.middleware.language.request_language(request) -> str`. First match wins:
  1. `/django-admin/` and the superadmin API (`/api/v1/platform-admin/`, and `/api/v1/platform/` except `/api/v1/platform/blog/`) → `"en"`.
  2. Public schema (contentor.app) → `resolve(NEXT_LOCALE cookie)` if set, else `resolve(translation.get_language_from_request(request))`.
  3. Claims role in `CREATOR_ROLES` → `resolve(user-locale cookie)` if set, else `creator_language(<user from claims>)`.
  4. Otherwise → `site_language()`.
- Produces `RequestLanguageMiddleware`, which sits where `LocaleMiddleware` was (after the tenant middleware):
  - activates `request_language(request)`;
  - sets `request.LANGUAGE_CODE`;
  - adds `Content-Language` to the response;
  - deactivates afterwards.
- Produces `apps/core/tests/i18n_utils.translated(msgid: str, lang: str = "tr") -> str`: the msgstr under `override(lang)`. It asserts the msgstr differs from `msgid`, with the message "run make translate".

- [ ] **Step 1: Write the failing tests.**
  - Use DRF's own Turkish catalog, which ships with DRF, so the tests don't depend on draft wording.
  - The probe is an unauthenticated GET of an `IsAuthenticated` endpoint on the shared tenant, with its `TenantConfig.default_locale` set to `tr`.

```python
def test_student_gets_site_language_whatever_the_browser(): ...  # student JWT, Accept-Language "en-US" → Content-Language "tr"
def test_anonymous_visitor_gets_site_language(): ...
def test_creator_gets_creator_language(): ...                    # owner JWT + cookie user-locale=de on the tr site → "de"
def test_creator_without_cookie_uses_their_row(): ...            # Bearer token only, preferred_locale "pl" → "pl"
def test_apex_follows_next_locale_then_accept_language(): ...
def test_django_admin_stays_english(): ...
@override_settings(ENABLED_LOCALES=["en"], LANGUAGES=[("en", "English")])
def test_hidden_language_answers_english(): ...
def test_drf_messages_are_translated(): ...                      # detail != "Authentication credentials were not provided."
```

- [ ] **Step 2: Run them (FAIL).**
- [ ] **Step 3: Implement.** Then rebuild the backend images once, as one heavy job: `docker compose build django celery-worker celery-agents celery-video celery-beat && docker compose up -d`.
- [ ] **Step 4: Move the `msg()` callers to gettext.** Their Turkish drafts come with Task 0.4's first `make translate`; until then they answer in English, which is the fallback. Run the tests (PASS), plus `make test-app APP=accounts` and `docker compose exec -T django pytest apps/core/tests -k "onboarding or signup or brand" -n auto -q`.
- [ ] **Step 5: Check the image.** Run `docker build backend -t contentor-i18n-check`. Expected: `compilemessages` runs with no error.
- [ ] **Step 6: Commit** with the message "feat(i18n): the backend answers each request in the right language".

### Task 0.3: The frontends resolve the language per route

Budget: 90 min. Wiki: `docs/wiki/other-frontend-customer-src.md`, `docs/wiki/student-portal-app-frontend-customer.md`. That wiki's messages page still describes the removed TR setup; ignore it.

**Files:**
- Create:
  - `packages/shared/src/i18n/locales.ts`
  - `packages/shared/src/i18n/messages/en/site.json` and `studio.json`, each starting as `{}`
  - `frontend-customer/src/i18n/surface.ts`
  - `frontend-customer/src/global.d.ts`, `frontend-main/src/global.d.ts`
- Modify:
  - `frontend-customer/src/i18n/config.ts`: delegate to shared; keep its exports for its importers.
  - `frontend-customer/src/i18n/request.ts`
  - `frontend-customer/src/app/layout.tsx:166-181`: the provider passes what `request.ts` loaded.
  - `frontend-customer/src/lib/tenant.ts:30` and `src/types/tenant.ts:176`: `default_locale`.
  - `frontend-main/src/i18n/config.ts`; `request.ts`, which also loads `studio` (English) for `/admin`.
  - `backend/apps/tenant_config/serializers.py:196-221`: `default_locale` read-only. Then run `npm run gen:api` and review the diff.
  - `docker-compose.yml:148-149, :176-177`: `NEXT_PUBLIC_ENABLED_LOCALES: ${ENABLED_LOCALES:-en}`.
  - `docker-compose.prod.yml`: build args `:314-316, :335-337` and env `:321-324, :342-345`, the same key.
  - `frontend-{main,customer}/Dockerfile:31-35`: ARG and ENV.
- Test:
  - `frontend-customer/src/i18n/__tests__/config.test.ts`, rewritten; today it asserts that `tr` falls back.
  - `frontend-customer/src/i18n/__tests__/surface.test.ts`

**Interfaces:**
- Produces `@shared/i18n/locales`:
  - `LOCALES: readonly string[]`;
  - `DEFAULT_LOCALE = "en"`;
  - `enabledLocales(): string[]`, read from `process.env.NEXT_PUBLIC_ENABLED_LOCALES` at call time; `en` first; unknown codes dropped;
  - `resolveLocale(v?: string | null): string`;
  - `nativeName(code: string): string`;
  - `ogLocale(code: string): string`.
- Produces `surfaceOf(pathname: string, embed: string | null, role?: string): "studio" | "site+owner" | "site"`:
  - `/admin…` and `/setup…` → `studio`;
  - role `owner` or `coach` with `embed` null or `"edit"` → `site+owner`, because the owner tools render on the public site (`(public)/layout.tsx:30-38`);
  - otherwise → `site`.
- Produces `namespacesFor(surface): { creator: string[]; site: string[] }`:
  - `studio` → creator `["common","admin","studio"]`, site `["site","student","pwa"]`;
  - `site+owner` → creator `["admin","studio"]`, site `["common","site","student","pwa"]`;
  - `site` → creator `[]`, site `["common","site","student","pwa"]`.
- Produces `request.ts`:
  - surface from `x-pathname` and `x-embed` (set by `src/middleware.ts:22, :27-32`), plus the role from `getAuthUser()` (wrap it in React `cache` if it isn't);
  - site language from `fetchTenantConfig(slug).default_locale`; creator language from the `user-locale` cookie; both through `resolveLocale`;
  - `locale` = creator language on `studio`, site language otherwise;
  - each namespace = the English file deep-merged with the language's file;
  - `getMessageFallback` returns the English string and logs `i18n: missing <locale> <ns.key>` once per key.
- Produces types: `declare module "next-intl" { interface AppConfig { Messages: typeof messages } }`.
  - frontend-customer messages: `admin`, `student`, `common`, `pwa`, `site`, `studio`.
  - frontend-main messages: its four namespaces, plus `site` and `studio`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("a hidden language falls back to English", () => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_LOCALES", "en,tr");
  expect(resolveLocale("tr")).toBe("tr");
  expect(resolveLocale("de")).toBe("en");
  expect(resolveLocale(undefined)).toBe("en");
});
it("studio paths follow the creator", () => expect(surfaceOf("/admin/courses", null, "owner")).toBe("studio"));
it("the owner on their own site", () => expect(surfaceOf("/courses", null, "coach")).toBe("site+owner"));
it("the setup preview frame is the plain site", () => expect(surfaceOf("/", "1", "owner")).toBe("site"));
it("a student never gets studio strings", () => expect(namespacesFor("site").creator).toEqual([]));
```

- [ ] **Step 2: Run them (FAIL).** Command: `cd frontend-customer && npx vitest run src/i18n`.
- [ ] **Step 3: Implement.** Then `make typecheck`.
- [ ] **Step 4: Check by hand.**
  1. Recreate the two Next containers so they read `NEXT_PUBLIC_ENABLED_LOCALES` from `.env`: `docker compose up -d nextjs-main nextjs-customer`. Then `curl -s http://demo-yoga.localhost/ | grep -o '<html lang="[a-z]*"'` gives `en`.
  2. Set demo-yoga's `default_locale` to `tr` in `make shell`. The public page gives `tr`; `/admin` stays `en`.
  3. Set it back.
- [ ] **Step 5: Commit** with the message "feat(i18n): the studio follows the creator and the site follows its own language".

### Task 0.4: The glossary and `make translate`

Budget: 2 h, plus one long drafting run. Wiki: `docs/wiki/other-makefile.md`.

**Files:**
- Create:
  - `packages/shared/src/i18n/glossary.json`, with its synced copy
  - `backend/apps/core/management/commands/translate.py`
  - `scripts/translate.py`, stdlib only, run on the host
- Modify:
  - `backend/apps/core/languages.py` (add `rule`)
  - `backend/requirements/dev.txt` (`polib`)
  - `backend/config/settings/base.py` (`TRANSLATE_MODEL = os.environ.get("TRANSLATE_MODEL", "claude-opus-5-5")`, beside the other model settings at :315-393)
  - `Makefile`:
    - `.PHONY` at line 1;
    - the help `grep -E` lists at lines 17-32;
    - targets `translate`, `translate-export`, `translate-import`.
  - `.gitignore` (`/i18n-review-*.csv`)
- Test: `backend/apps/core/tests/test_translate_command.py`, plus `python3 scripts/translate.py --self-test`

**Interfaces:**
- Produces `glossary.json`:
  - `{"voice": {"de": "Address the reader informally with du.", "pl": "Address the reader informally with ty.", "tr": "Address the reader informally with sen."}, "terms": [{"en", "tr", "de", "pl", "note"?}]}`.
  - At least these terms:
    - creator (note: never coach, teacher or instructor);
    - Creator studio;
    - platform (note: never school);
    - course, module, lesson, download, digital content;
    - live session (note: never live class), live stream, in-person event;
    - membership, plan, student, look, page, email campaign, announcement, community;
    - sign in.
  - Draft the tr, de and pl columns with the model, then hand-check them against the existing UI words.
- Produces `languages.rule(language) -> str`. `language` is a code, or `None` (Task 2.1 adds `Mixed`).
  - `None` → `""`.
  - Otherwise the rule is `"Write every word a reader will see in {name}. Keep brand names and the creator's own words as they wrote them. Search terms, photo briefs and image prompts stay in English."`, followed by:
    - the voice line (not for English);
    - `"Use these words: course = …; …."` from the glossary (not for English).
- Produces `manage.py translate`:
  - `--draft <lang>`:
    - reads stdin `{"items": [{"key", "en", "where"}]}`;
    - writes stdout `{"<key>": "<translation>"}`;
    - works in batches of 40 through `ai.structured`, with `TRANSLATE_MODEL` and `rule(lang)` in `system`;
    - keeps ICU arguments and tags as they are.
  - `--po [--to <lang>] [--redraft]`:
    - runs `makemessages --add-location=file --no-obsolete` for the non-English locales;
    - drafts every entry that is untranslated, has a previous msgid (`#|`), or is fuzzy under `--redraft`;
    - plural entries get every form in the language's `Plural-Forms`;
    - sets the `fuzzy` flag and clears the previous msgid;
    - then runs `compilemessages --use-fuzzy`.
  - `--export <lang>`: JSON lines `{"key": "backend:<msgctxt>\u0004<msgid>", "english", "translation", "where"}`, one per fuzzy entry.
  - `--import <lang>`: reads those rows from stdin, sets the msgstr, drops `fuzzy`, then compiles.
- Produces `scripts/translate.py`:
  - `[--to <lang>] [--root <dir> …] [--redraft]`:
    - default roots: `frontend-main/messages`, `frontend-customer/messages`, `packages/shared/src/i18n/messages`;
    - flattens `en/*.json`;
    - a key needs drafting when it is missing in `<lang>/`, when its `<lang>.review.json` entry is missing, when the entry's `src` ≠ the first 8 hex of sha1(English), or (under `--redraft`) when it is unreviewed;
    - pipes the drafts through `docker compose exec -T django python manage.py translate --draft <lang>`;
    - writes the values in English's key order, with review entries `{src, reviewed: false}`;
    - drops keys English no longer has;
    - then runs `--po`.
  - `export <lang> [--out i18n-review-<lang>.csv]`:
    - columns `key, english, translation, where`;
    - unreviewed JSON keys (`where` = `<root>:<namespace>`) plus the backend rows.
  - `import <file.csv> [--to <lang>]`: JSON rows get their value and `reviewed: true`; `backend:` rows go to `--import`.
  - `--self-test`: inline cases in the style of `select_tests.py`:
    - flatten and unflatten;
    - a stale hash;
    - a CSV round trip with commas, quotes and newlines.
- Produces Make targets:
  - `make translate [TO=tr] [REDRAFT=1]`
  - `make translate-export TO=pl`
  - `make translate-import FILE=i18n-review-pl.csv`

- [ ] **Step 1: Write the failing tests,** with `ai.structured` faked.

```python
def test_draft_mode_maps_keys_and_sends_the_rule(): ...      # system contains "German", "du", the glossary's de "Creator studio"
def test_po_mode_drafts_untranslated_entries_as_fuzzy(): ...
def test_po_mode_redrafts_an_entry_whose_english_changed(): ...
def test_a_polish_plural_gets_three_forms(): ...
def test_import_clears_fuzzy(): ...
```

- [ ] **Step 2: Run them (FAIL).**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests (PASS),** and `python3 scripts/translate.py --self-test` (PASS).
- [ ] **Step 5: Draft everything that exists today** with `make translate`: about 1,700 frontend-customer keys and 400 frontend-main keys, times three languages.
  - Then open five Turkish screens' worth of keys and check that they read naturally.
  - Send the owner the glossary's Turkish column (about 25 lines) to check; don't wait for the answer.
  - If a term changes later, run `make translate TO=tr REDRAFT=1`.
- [ ] **Step 6: Commit** the tool, the glossary and the drafts, in separate commits ("feat(i18n): make translate drafts missing text with the glossary" and "chore(i18n): first drafts for tr, de and pl").

### Task 0.5: The lint checks and the agents' rules

Budget: 2 h. Wiki: `docs/wiki/other-scripts.md`.

**Files:**
- Create:
  - `scripts/check-i18n.mjs`, starting from `git show 0886b80c^:scripts/check-i18n-parity.mjs`
  - `scripts/i18n-baseline.json`
  - `backend/apps/core/management/commands/i18n_check.py`
  - `backend/apps/core/i18n/baseline.json`
- Modify:
  - `Makefile` `lint` (`:138-143`): add `node scripts/check-i18n.mjs`, `node scripts/check-i18n.mjs --self-test`, `python3 scripts/translate.py --self-test` and `docker compose exec -T django python manage.py i18n_check`.
  - `CLAUDE.md` and `AGENTS.md`: a "Text and languages" section next to "Loading & feedback conventions".
  - `docs/REFERENCE.md:624`: the locale is per route now, not per host.
- Test:
  - `node scripts/check-i18n.mjs --self-test`
  - `backend/apps/core/tests/test_i18n_check.py`

**Interfaces:**
- Produces `node scripts/check-i18n.mjs [--update] [--self-test]`. It loads `typescript` through `createRequire` from `frontend-customer/package.json`; the repo root has no `node_modules`.
  1. **Completeness.** For every messages root and every code in `locales.json`, every namespace file exists and holds the same flattened keys as English. For each key:
     - the same ICU argument names (`{name}`, `{name, plural|select|selectordinal|number|date|time, …}`) and the same rich-text tags;
     - a review entry whose `src` matches the English.

     A failure ends with "run `make translate`".
  2. **Ratchet.** Counts literals per file under `frontend-main/src`, `frontend-customer/src` and `packages/shared/src`.
     - Skipped:
       - frontend-main `app/admin/**` and `components/admin/**` (superadmin);
       - frontend-customer `app/design-showcase/**` and `components/sections/fixtures.ts`;
       - `__tests__` and `*.test.*`.
     - Counted:
       - `JsxText` with two or more letters;
       - string or template literals as the value of `label`, `placeholder`, `title`, `aria-label`, `alt`, `loadingText`, `description`, `emptyText`, `confirmText`, `cancelText` or `tooltip`. Do a dry run that prints the 20 most frequent props holding capitalised literals, and add any user-facing ones to this list.
       - the first argument of `toast(…)` and `toast.success|error|info|warning|message(…)`.
       - Nothing inside `t(…)` is counted.
     - The counts must equal `scripts/i18n-baseline.json` (`{path: n}`).
       - Higher → fail with "move the text to messages: see CLAUDE.md 'Text and languages'".
       - Lower → fail with "run `node scripts/check-i18n.mjs --update`".
     - `--update` only lowers counts and removes files; it writes the full baseline only when none exists.
  3. **Locale lists.** No `.ts`/`.tsx` file outside `packages/shared/src/i18n/` has an array literal holding two or more of the codes.
- Produces `manage.py i18n_check [--update]`:
  1. **Ratchet**, per file under `apps/`.
     - Skipped: tests, migrations, `management/commands/`, `demo_seed/`, `admin.py`, `admin_panels.py`, `core/platform/`.
     - Counted, for strings with two or more letters that are not `UPPER_SNAKE` codes or URLs:
       - `"detail"` and `"error"` values;
       - the first argument (or `detail=`) of `ValidationError`, `serializers.ValidationError`, `PermissionDenied`, `NotFound`, `ParseError` and `AuthenticationFailed`;
       - values under the keys or keyword arguments in `COPY_KEYS = {"subject", "title", "heading", "subheading", "body", "text", "label", "button", "cta", "ctaText", "buttonText", "submitLabel", "successMessage", "intro", "question", "hint", "placeholder", "description", "message", "note", "summary"}`.
     - Strings inside gettext calls never count.
     - The counts must equal `apps/core/i18n/baseline.json`, with the same `--update` rules.
  2. **Coverage.** Every literal passed to `_`, `gettext*`, `ngettext*` or `pgettext*` has a non-empty msgstr in each language's `.po`.
     - A non-literal argument or an f-string there is an error.
     - The msgstr keeps the msgid's `%(name)s` / `{name}` set.
  3. **Locale lists.** No tuple or list literal holds two or more of the codes, except in `languages.py`, migrations, tests, and lines marked `# not-site-locales`. Mark `reels/moments.py:33-43`, which lists caption languages.
- Produces the "Text and languages" section, at most 15 lines:
  - the namespaces by reader;
  - key naming;
  - ICU plurals;
  - formatting helpers;
  - backend gettext and `override`;
  - AI `language=`;
  - "after adding or changing English, run `make translate`".

- [ ] **Step 1: Write the self-test cases first.** The check fails until they pass.
  - `<p>Hello world</p>` → 1.
  - `<Input placeholder="Email" />` → 1.
  - `<p>{t("x")}</p>` → 0.
  - `toast.success("Saved")` → 1.
  - `className="h-4"` → 0.
  - `"{count} courses"` against `"{n} kurs"` → error.
  - A missing key → error.
  - A stale `src` → error.
  - `["en", "tr"]` → error.
- [ ] **Step 2: Write `test_i18n_check.py`** against files in a tmp dir:
  - counts;
  - `_(f"x {y}")` flagged;
  - a `.po` missing an entry flagged;
  - a placeholder mismatch flagged.
- [ ] **Step 3: Run both (FAIL).**
- [ ] **Step 4: Implement both checks.** Then write the first baselines with `--update`.
- [ ] **Step 5: Run `make lint` (PASS),** then the new tests (PASS).
- [ ] **Step 6: Commit** with the message "feat(i18n): make lint stops English from leaking back in".

### Task 0.6: Dates, numbers and upper-casing in the active locale

Budget: 2 h. Wiki: `docs/wiki/other-frontend-customer-src.md`, `docs/wiki/live-events-calendar-src.md`.

**Files:**
- Modify:
  - `frontend-customer/src/lib/format.ts` (`formatDate` :8, `formatMoney` :24, `currencySymbol` :51)
  - `packages/shared/src/lib/format-plan-price.ts`
  - `frontend-customer/src/lib/calendar-utils.ts:98, :106, :141`
- Modify the 19 `en-US`/`en-GB` sites:
  - frontend-customer:
    - `admin/payouts/page.tsx:250`
    - `(public)/blog/[slug]/page.tsx:57`
    - `public/calendar/calendar-month-view.tsx:62, :264`
    - `calendar-agenda-view.tsx:36`
    - `event-detail-client.tsx:39`
    - `lib/interview.ts:249, :486, :544`
    - `lib/covers/recipe.ts:288`
  - frontend-main: `landing/earnings-calculator.tsx:73`, `landing/payment-feed.tsx:51`
  - `components/copilot/mic-button.tsx:68`: speech recognition gets `ogLocale(creator).replace("_", "-")`.
- Modify the other places that hard-code a locale or format without one:
  - the 63 calls without a locale (`toLocaleDateString`, `toLocaleString`, `Intl.*` with `undefined`);
  - the English weekday arrays: `unified-calendar.tsx:89`, `announcement-compose.tsx:55`, `announcement-recurring-list.tsx:17`, `blog/autopilot-card.tsx:24`;
  - `sections/pop/events.tsx:20-22`.
- Modify the 28 `toUpperCase()` calls that touch words. Leave codes and file extensions alone (`lib/interview.ts`'s currency code, `lib/file-icons.ts`).
- Test: `frontend-customer/src/lib/__tests__/format.test.ts`

**Interfaces:**
- Produces `formatDate`, `formatMoney`, `currencySymbol` and `formatPlanPrice`, each with a **required** `locale: string` parameter. `make typecheck` lists every caller.
- Produces `weekdayNames(locale: string, width: "short" | "long"): string[]`, Monday first, in `calendar-utils.ts`. It is already Monday-first (`:6-7, :28`).

- [ ] **Step 1: Write the failing tests.**

```ts
expect(formatMoney(49, "EUR", "de").replace(/\s/g, " ")).toBe("49,00 €");
expect(formatDate("2026-11-05T10:00:00Z", "tr")).toContain("Kasım");
expect(weekdayNames("pl", "long")[0]).toBe("poniedziałek");
expect(weekdayNames("tr", "short")[0]).toBe("Pzt");
```

- [ ] **Step 2: Run them (FAIL).**
- [ ] **Step 3: Implement the helpers.** Fix the callers: `useLocale()` on the client, `getLocale()` on the server.
- [ ] **Step 4: Run vitest for both apps (PASS).** Then run `make typecheck` and `grep -rn '"en-US"\|"en-GB"' frontend-*/src packages/shared/src`. Expected: tests only.
- [ ] **Step 5: Commit** with the message "fix(i18n): dates, numbers and capitals follow the page's language".

### Task 0.7: Fonts that carry Turkish and Polish

Budget: 60 min. Wiki: `docs/wiki/logo-studio-brand-identity-frontend-customer-src.md`.

**Files:**
- Modify:
  - `frontend-customer/src/app/setup/page.tsx:13-17`: `subsets: ["latin", "latin-ext"]`.
  - `frontend-customer/src/lib/logo/brand-kit.ts:74-76`: Fontsource loads `latin` and `latin-ext` and picks the file per character.
  - `packages/shared/src/logo/export.ts:72-76`: keeps the `latin-ext` `@font-face` block as well.
- Create: `packages/shared/src/i18n/font-subsets.json` (`{family: subsets[]}`) for every family the style manifests and the logo font list use. Generate it once from `https://fonts.google.com/metadata/fonts` and commit the result; the test never touches the network.
- Test: `frontend-customer/src/lib/__tests__/font-subsets.test.ts`

**Interfaces:**
- Produces `subsetsFor(text: string): string[]` in `brand-kit.ts`: `"Yoga"` → `["latin"]`; `"Işık"` → `["latin", "latin-ext"]`.

- [ ] **Step 1: Write the failing tests:**
  - every family in `packages/shared/src/sections/styles/*.json` and the logo catalog is in `font-subsets.json`, and covers every subset any locale in `locales.json` needs;
  - the two `subsetsFor` cases above.
- [ ] **Step 2: Run them (FAIL).** Then implement, and run them again (PASS).
- [ ] **Step 3: Export a logo whose brand name is "Işık Łódź"** from the Logo Studio. Check that every letter is drawn, with no boxes.
- [ ] **Step 4: Check the reels caption fonts.** Run `docker compose exec -T video fc-list ':charset=131 142 15f' family`; it must list the caption font from `reels/ass.py`. If it doesn't, note the gap as a concern.
- [ ] **Step 5: Commit** with the message "fix(i18n): Turkish and Polish letters draw in setup and in exported logos".

### Task 0.8: One transliterating slugify

Budget: 60 min. Wiki: `docs/wiki/onboarding-wizard-site-ai-backend-apps.md`.

**Files:**
- Create: `backend/apps/core/slugs.py`
- Modify every non-test `django.utils.text.slugify` import:
  - `core/onboarding/site_name.py:44, :53, :80`
  - `core/onboarding/views.py:108, 112, 130, 133, 134`
  - `blog/models.py:14-24`
  - `focus/kinds/post.py:43, :165`
  - `blog/platform_views.py:34-40`
  - `courses/models.py:65`
  - `tags/models.py:36`, `tags/views.py:32`
  - `filters/models.py:30, 58`
  - `reels/views.py:153`
  - `media/design_views.py:230`
  - `adminkit/options.py:148`
- Modify:
  - `frontend-customer/src/lib/slug.ts` (`siteSlug`)
  - `i18n_check`: a rule that `django.utils.text.slugify` is imported only in `apps/core/slugs.py`.
- Test: `backend/apps/core/tests/test_slugs.py`, `frontend-customer/src/lib/__tests__/slug.test.ts` (extend)

**Interfaces:**
- Produces `apps.core.slugs.slugify(value: str) -> str`.
  - First `str.translate` with `{"ı": "i", "ł": "l", "Ł": "l", "ß": "ss"}`, the letters NFKD can't fold.
  - Then Django's `slugify`, which does the NFKD fold and drops non-ASCII. Every other mapping the spec lists (ğ, ş, ç, ö, ü, ä, ą, ę, ś, ź, ż, ć, ń, ó, İ) folds through NFKD.
- Produces `siteSlug(value: string): string`, doing the same before its NFKD step.
- `site_name.token_tenant`: a legacy token tries the new slug first, then Django's original `slugify`.

- [ ] **Step 1: Write the failing tests.** Use the same cases in both languages:

```python
CASES = {"Işık Yoga": "isik-yoga", "Łódź Pilates": "lodz-pilates", "Straße Fitness": "strasse-fitness",
         "Gülşen Çağrı": "gulsen-cagri", "İstanbul Dans": "istanbul-dans",
         "Zażółć gęślą jaźń": "zazolc-gesla-jazn", "Yoga with Mara": "yoga-with-mara"}
def test_legacy_token_finds_a_site_named_with_the_old_slug(): ...  # tenant slug "isk-yoga", token {"brand_name": "Işık Yoga"} without "site"
```

- [ ] **Step 2: Run them (FAIL).** Then implement and switch the imports.
- [ ] **Step 3: Run the tests (PASS),** plus `make test-changed` and the frontend-customer slug test. Then `make lint`.
- [ ] **Step 4: Commit** with the message "fix(i18n): Turkish, German and Polish names keep their letters in addresses".

---

## Phase 1: Students see the site's language

### Task 1.1: The section kits (**agy**)

Budget: 3 h, plus review. Wiki: `docs/wiki/tenant-config-site-builder-src.md`.

**Files:**
- Modify:
  - `frontend-customer/src/components/sections/**`: 286 files.
    - The editor placeholders (`placeholder="Heading"` ×118, "Button text" ×75, …) become one `site.placeholder.*` key each.
    - Empty states (`title="No published courses yet"`, …) become `site.empty.*`.
    - The 40 plural ternaries in `<style>/{courses,pricing}.tsx` and `rows.tsx` become ICU.
  - `packages/shared/src/i18n/messages/en/site.json`

**Interfaces:**
- Consumes the extraction recipe and the namespaces from Task 0.3.
- Produces a ratchet count of 0 for every file under `components/sections/` except `fixtures.ts`.

- [ ] **Step 1: Brief agy** with this task, the recipe, and the placeholder and empty-state frequency list:

  ```bash
  grep -rhoE 'placeholder="[^"]+"|title="[^"]+"' frontend-customer/src/components/sections | sort | uniq -c | sort -rn
  ```
- [ ] **Step 2: Review the diff** against the recipe's checklist. Render `http://demo-yoga.localhost/design-showcase?style=journal&page=home` and one more style: English unchanged.
- [ ] **Step 3: Run the recipe's step 6.** Commit with the message "feat(i18n): the section kits speak the site's language".

### Task 1.2: Public pages, the student area and sign-in (**agy**, three batches)

Budget: 4 h, plus review. Wiki: `docs/wiki/student-portal-app-frontend-customer.md`.

**Files** (each batch must end with a ratchet count of 0 for its files):
- **Batch a, the public site:**
  - frontend-customer:
    - `src/app/(public)/**`
    - `src/components/public/**`
    - `src/components/blocks/**`
    - `src/components/shared/{public-header,public-footer,install-prompt}.tsx`
    - `src/components/install/**`
  - Its `generateMetadata` and `openGraph.locale` (via `ogLocale`)
  - `src/app/manifest.ts`: `lang` and the description from the site language
  - `src/app/{sitemap.ts,robots.ts,llms.txt/route.ts}` and `lib/site-index.ts`
- **Batch b, the student area:** frontend-customer `src/app/(student)/**`, `src/app/(auth)/**`, `src/components/{community,billing,live}/**` (the student-facing files).
- **Batch c, shared visitor-facing components:** `packages/shared/src/{checkout,ui}/**`, the visitor-facing parts.

**Interfaces:**
- Consumes the recipe.
- Produces `site.*` / `student.*` keys; the existing `student.json` keys stay where they are.

- [ ] **Step 1: Brief and review each batch** as in Task 1.1, one commit per batch. Each commit message says which batch ("feat(i18n): the public site speaks the site's language", …).
- [ ] **Step 2: Walk the result once.**
  - Run `make e2e-changed`.
  - Open `/`, `/courses`, `/plans`, `/events`, `/login` and the student dashboard on demo-yoga, set to `tr`.
  - Expected: no English interface text. Course titles are the creator's own words and stay English.

### Task 1.3: Previews in the site language

Budget: 60 min. Wiki: `docs/wiki/email-campaigns-packages-shared.md`.

**Files:**
- Create: `packages/shared/src/i18n/site-preview.tsx`
- Modify:
  - `frontend-customer/src/app/admin/layout.tsx` and the `/setup` page: wrap them in `SiteLocaleBoundary`.
  - Every studio component that renders site blocks or a site email inside a studio page:
    - the shared email editor canvas and preview (`packages/shared/src/email/editor/canvas/*`);
    - the look tiles and look gallery in `components/setup-flow/`;
    - `components/reels/reel-cover.tsx` and `reel-editor.tsx`;
    - the course page preview;
    - more can be found by grepping for `Preview` in `src/components/admin` and `setup-flow`.
- Test: `frontend-customer/src/components/shared/__tests__/site-preview.test.ts`

**Interfaces:**
- Produces two client components:
  - `SiteLocaleBoundary({ locale, children })`: a context provider rendered by the studio's server layouts.
  - `SitePreview({ children })`. It renders `<NextIntlClientProvider locale={siteLocale} messages={useMessages()} timeZone={useTimeZone()}>` around a `<div lang={siteLocale} className="contents">`, so CSS casing and hyphenation follow the site.
  - With no boundary (frontend-main superadmin), `SitePreview` renders its children unchanged.

- [ ] **Step 1: Write the failing test.**
  - Render a block that uses `site.placeholder.heading` inside `SitePreview`, with the boundary set to `tr` and the outer provider set to `en`.
  - Expect the Turkish text, and `lang="tr"` on the wrapper.
- [ ] **Step 2: Run it (FAIL).** Implement, run it again (PASS). Commit with the message "feat(i18n): previews in the studio show the site's language".

### Task 1.4: Starter content written in the site language

Budget: 2 h. Wiki: `docs/wiki/onboarding-wizard-site-ai-backend-apps.md`, `docs/wiki/tenant-config-site-builder-apps.md`.

**Files:**
- Modify:
  - `backend/apps/core/onboarding/compose.py:20-60`:
    - `COPY` becomes `gettext_lazy` entries and `_t` goes;
    - `build_config_overrides` (`:67`) evaluates them under `override(locale)`.
  - `backend/apps/tenant_config/defaults.py`: `header_cta` :192-195 and the default pages :213-320.
  - `backend/apps/core/tasks.py:24` `_create_default_config`: its parameter becomes `site_locale`, and it writes under `override(site_locale)`.
  - `backend/apps/tenant_config/interview_milestones.py` `sync_memberships`: "Cancel any time.", "everything I teach", `for {teaches}`.
  - `backend/apps/core/onboarding/site_composer.py:982-984`: the fallback idea titles.
  - `backend/apps/email_campaigns/starters.py`:
    - every builder;
    - `_sign_off` :237-239 and `_joined` :289-293;
    - `ensure()` :439-467 runs under `override(site_language())`.
  - `backend/apps/email_campaigns/catalog.py:85` ("Free")
  - `backend/apps/notifications/templates_builtin.py`: `builtin_templates()` :59-74 runs under `override(site_language())`, including the "us" fallback.
  - The focus and logo defaults that land on the site, for example the placeholder title at `core/focus/kinds/post.py:43`. The backend ratchet lists the rest under `core/focus/` and `tenant_config/logo_*.py`; take the site-facing ones here and leave creator-facing copy to Task 4.4.
- Check whether any screen still calls frontend-main's `seedFromTemplate` (`frontend-main/src/lib/api/onboarding.ts:45`). If one does, a non-English site uses `skip_template`; the template content is English.
- Test: `backend/apps/core/tests/test_starter_content_language.py`

**Interfaces:**
- Consumes `site_language()`, `translated()` and the backend recipe.
- Produces a ratchet count of 0 for `compose.py`, `defaults.py`, `starters.py` and `templates_builtin.py`.

- [ ] **Step 1: Write the failing tests,** on a tenant set to `tr`:
  - `build_config_overrides(...)`'s nav labels contain `translated("Courses")`;
  - `sync_memberships` writes a description ending in `translated("Cancel any time.")`;
  - `starters.ensure()` writes subjects equal to their Turkish msgstrs;
  - `builtin_templates()` returns Turkish titles.
- [ ] **Step 2: Run them (FAIL).** Implement, then run `make translate` and the tests (PASS).
- [ ] **Step 3: Commit** with the message "feat(i18n): what setup writes onto a site is in the site's language".

### Task 1.5: Student emails, the unsubscribe page and pushes

Budget: 3 h. Wiki: `docs/wiki/mailbox-notifications-backend-apps.md`, `docs/wiki/email-campaigns-backend-apps.md`.

**Files:**
- Modify `backend/apps/notifications/transactional.py`:
  - every builder (`:681`–`:849`);
  - "Unsubscribe" at `:263, :331, :352`; "Take a look" at `:244`; `_per` :614-617;
  - `send()` :379 and `deliver()` :406 render under `override(site_language())`;
  - `when()` :666, `day()` :674 and `money()` :662 use `django.utils.formats.date_format` / `number_format` in the active language. The site's time zone and its label stay.
- Modify the other email parts:
  - `backend/apps/email_campaigns/catalog.py:46-56`: `when`, `short_when`.
  - `backend/apps/email_campaigns/render.py:1309`
  - `backend/apps/email_campaigns/tasks.py:65-84`: the fallback footer and the "there" fallback for `{{FirstName}}`, rendered at send time under the site language.
  - `backend/apps/notifications/email_render.py:35-46`: "News", "Open".
  - `backend/apps/notifications/views.py:25-35`: the unsubscribe page becomes gettext, in a minimal HTML page with `lang`.
- Modify pushes:
  - `backend/apps/notifications/payloads.py:10-49`
  - `backend/apps/notifications/tasks.py`: the fan-outs at `:38`, `:77-92`, `:96` and `:168` run under `override(site_language())`.
- Test: `backend/apps/notifications/tests/test_student_language.py`

**Interfaces:**
- Produces a ratchet count of 0 for the files above.

- [ ] **Step 1: Write the failing tests.**

```python
@pytest.mark.parametrize("lang", ["tr", "de", "pl"])
def test_every_transactional_email_has_no_english_template_string(lang): ...
    # render every builder on a tenant in `lang`; the English msgids polib finds in that .po whose
    # occurrences include notifications/transactional.py, and whose msgstr differs, appear nowhere in the HTML
def test_class_reminder_date_is_turkish(): ...       # a November class: "Kasım" in the subject or body
def test_unsubscribe_page_is_in_the_site_language(): ...
def test_live_reminder_push_is_in_the_site_language(): ...
```

- [ ] **Step 2: Run them (FAIL).** Implement, then run `make translate` and the tests (PASS), plus `make test-app APP=notifications` and `make test-app APP=email_campaigns`.
- [ ] **Step 3: Commit** with the message "feat(i18n): students get every email and push in the site's language".

### Task 1.6: Checkout, Stripe receipts and the PWA

Budget: 90 min. Wiki: `docs/wiki/billing-payments-backend-apps.md`.

**Files:**
- Modify:
  - `backend/apps/billing/providers/stripe_provider.py:29`: `_SUPPORTED_STRIPE_LOCALES` becomes the `stripe` values of `locales.json`.
  - `backend/apps/billing/providers/connect.py`: `create_marketplace_checkout` :136-175 and `create_subscription_checkout` :211-246 pass `locale=info(site_language())["stripe"]` and `metadata["locale"]`.
  - `backend/apps/billing/views/webhooks_connect.py`: on `checkout.session.completed`, call `stripe.Customer.modify(customer, preferred_locales=[metadata.locale], stripe_account=<account>)` when both are present.
- Test: `backend/apps/billing/tests/test_checkout_locale.py`

**Interfaces:**
- Produces a student Checkout in the site language. Stripe's own receipts follow the customer's `preferred_locales`.

- [ ] **Step 1: Write the failing tests,** with Stripe mocked:
  - a `tr` site's marketplace and subscription checkouts send `locale="tr"` and `metadata["locale"] == "tr"`;
  - the webhook calls `Customer.modify` with `preferred_locales=["tr"]` on the connected account.
- [ ] **Step 2: Run them (FAIL).** Implement, run them again (PASS). Commit with the message "feat(i18n): students pay and get receipts in the site's language".

### Task 1.7: Proof: a student on a Turkish site

Budget: 90 min plus one e2e run. Wiki: `docs/wiki/other-e2e-specs.md`.

**Files:**
- Create: `e2e/specs/43-site-in-turkish.spec.ts`, `e2e/helpers/leaks.ts`
- Modify:
  - `e2e/global-setup.ts`: reset demo-yoga's `default_locale` to `en` after seeding, in case a killed run left it Turkish.
  - `e2e/impact-map.json`: map `43-site-in-turkish` to
    - backend: `apps/core/languages.py`, `apps/core/middleware/language.py`, `apps/notifications/transactional.py`;
    - frontend-customer: `src/i18n`.

    Mapped specs stay out of `manual`; the selector self-test in `make lint` checks this.

**Interfaces:**
- Produces `e2e/helpers/leaks.ts`:
  - `leakCandidates(en: object, other: object): string[]`: the English leaf values that are at least 4 characters long, contain no `{`, and differ from the other language's value;
  - `englishLeaks(page: Page, candidates: string[]): Promise<string[]>`: the candidates found as whole phrases in `document.body.innerText`.

- [ ] **Step 1: Write the test "a student with an English browser meets no English on a Turkish site".**
  - Setup:
    - `beforeAll` sets demo-yoga to `tr` (`manage(["shell", "-c", …])`); `afterAll` sets it back.
    - The context uses `locale: "en-US"`.
  - Pages: `/`, `/courses`, a course page, `/plans`, `/events`, `/calendar` and `/login`.
  - Expect, on every page:
    - `html[lang=tr]`;
    - `englishLeaks` against `site.json`, `student.json`, `common.json` and `pwa.json` is `[]`.
  - Then sign in by magic link: `latestEmail` has `lang="tr"`, and its subject is not the English sign-in subject.
  - After sign-in, the dashboard passes the same leak check.
- [ ] **Step 2: Run it.** First `pgrep -fl 'playwright test'`, then `make e2e-spec SPEC=43-site-in-turkish`. Fix leaks in the owning task's files; the spec is not where they get fixed.
- [ ] **Step 3: Commit** with the message "test(e2e): a student on a Turkish site meets no English".

---

## Phase 2: AI writes in the right language

### Task 2.1: `language=` at the five entry points, on every call site

Budget: 3 h. Wiki: `docs/wiki/ai-infrastructure-assistants-backend-apps.md`.

**Files:**
- Modify `backend/apps/core/ai.py`. Each of these gains a keyword-only `language: str | Mixed | None` with **no default**:
  - `structured` :170;
  - `structured_stream` :620;
  - `structured_messages` :709;
  - `stream_text` :742;
  - `agentc_look` :443.

  `system` becomes `system + "\n\n" + rule(language)` when the rule is not empty. Providers are unchanged. Update the contract note at :25-28.
- Modify:
  - `backend/apps/core/languages.py`: add `class Mixed(NamedTuple): creator: str; site: str`, and `rule()` handles it.
  - `backend/apps/core/assistant.py:64-75`: `run_chat` takes `language` and passes it through.
  - `i18n_check`: every call of those five names passes `language=`.
  - `translate.py` (Task 0.4): passes `language=lang` and stops adding the rule itself.
  - The two strict fakes: `core/tests/test_ai_check.py:26` and `tenant_config/tests/test_site_qa.py:252`.
- Modify every call site, with the value in this table:

| `language=` | Call sites (module:line → caller) |
|---|---|
| `site_language()` | `blog/ai.py:239, :359`: these functions take `language`; tenant callers pass `site_language()` and `blog/platform_views.py:73` passes the post's (Task 3.5) · `core/focus/{announce:77, copywriter:139, covers:150, descriptions:103, outline:138}` · `core/onboarding/ai_compose.py:267` · `core/onboarding/site_composer.py:1040, :1589` · `email_campaigns/designer.py:299` · `media/design_ai.py:71` · `tenant_config/cx/compose.py:88` · `tenant_config/look_copy.py:159` · `tenant_config/setup_flow.py:595` · `tenant_config/site_qa.py:199` · `core/copilot/photos.py:349` · `student_bot` via `run_chat` (`tenant_config/student_bot.py:349`) |
| `creator_language(…)` | `core/focus/analysis.py:148`, `followup.py:137` · `core/onboarding/about_check.py:173` · `tenant_config/logo_ai.py:614` · the help bot's `run_chat` (`help_bot.py:222`; its marketing-visitor persona passes `translation.get_language()`) |
| `Mixed(creator_language(), site_language())` | `core/copilot/engine.py:1816` · `tenant_config/interview.py:560` · `core/onboarding/name_check.py:64, :112` · `tenant_config/logo_converse.py:446, :476, :515, :557` · `reels/moments.py:234` |
| the caption target | `reels/moments.py:277` (`translate`) |
| `None` (nobody reads it) | `core/management/commands/ai_check.py:52` · `core/onboarding/ai_curate.py:222` · `core/onboarding/ai_photos.py:158` · `reels/covers.py:199, :226` |

  These model paths don't go through `ai.py` and stay as they are:
  - `logo_image.py`: marks carry no text;
  - `media/photo_edits.py`: image edits;
  - `courses/captions.py`: Scribe (see Calls);
  - `curated_images/client.generate`: the creator's own prompt.
- Test: `backend/apps/core/tests/test_ai_language.py`

**Interfaces:**
- Produces `Mixed` and `rule(Mixed(creator, site))`: `"Talk to the creator in {creator}. Write every word that goes on their site in {site}."`, followed by the single rule's last two sentences, then the voice and glossary lines for each non-English language involved.

- [ ] **Step 1: Write the failing tests.**

```python
@pytest.mark.parametrize("fn", [ai.structured, ai.structured_stream, ai.structured_messages, ai.stream_text, ai.agentc_look])
def test_language_is_required(fn):
    assert inspect.signature(fn).parameters["language"].default is inspect.Parameter.empty
def test_rule_is_appended_to_system(monkeypatch): ...   # capture system at _anthropic_structured; None leaves it byte-identical
def test_mixed_names_both_languages():
    r = rule(Mixed(creator="tr", site="en")); assert "Turkish" in r and "English" in r
def test_rule_keeps_searches_english(): assert "stay in English" in rule("pl")
def test_rule_carries_voice_and_terms(): assert "du" in rule("de")
```

- [ ] **Step 2: Run them (FAIL).** Implement. Then `docker compose exec -T django python manage.py i18n_check` (PASS) and `make test-changed`.
- [ ] **Step 3: Commit** with the message "feat(i18n): every AI call says which language it writes in".

### Task 2.2: Prompts stop hard-wiring English; caches carry the language

Budget: 2 h. Wiki: `docs/wiki/onboarding-wizard-site-ai-backend-apps.md`, `docs/wiki/blog-ai-content-backend-apps.md`.

**Files:**
- Modify the prompts that name a language today. Remove:
  - `core/onboarding/ai_compose.py:159, :166`, and the unused `locale` at :158 ("Write in the language named in the brief" at :106 goes too);
  - `core/onboarding/ai_curate.py:60, :73`, and `CoachBrief.locale`;
  - `core/onboarding/starter_post.py:46, :49`;
  - `tenant_config/interview.py:128`;
  - `tenant_config/look_copy.py:36`;
  - `tenant_config/help_bot.py:50-51, :81-82`;
  - `tenant_config/student_bot.py:52-53`;
  - `email_campaigns/designer.py:93`.

  Keep `about_check.py:119` ("descriptive words in English"): those fields are machine-read.
- Modify the language plumbing:
  - `core/onboarding/site_ai.py:95`: `locale="en"` becomes `site_language()`.
  - `core/tasks.py:226, :282, :624`: drop the unused `preferred_locale` arguments.
- Modify the caches:
  - `tenant_config/help_bot.py:253`
  - `tenant_config/student_bot.py:306`
  - `tenant_config/look_copy.py`, its hash
- Test: `backend/apps/tenant_config/tests/test_ai_caches.py`

- [ ] **Step 1: Write the failing test.**

```python
@pytest.mark.parametrize("cache_user", ["help_bot", "student_bot", "look_copy"])
def test_cache_key_carries_language(cache_user): ...   # same input, tr then en → two keys, two model calls
```

- [ ] **Step 2: Run it (FAIL).** Implement, run it again (PASS), plus `make test-changed`.
- [ ] **Step 3: Generate a look sample for a `pl` site in the dev stack.** Expected: Polish copy.
- [ ] **Step 4: Commit** with the message "feat(i18n): AI prompts and caches follow the language they are given".

### Task 2.3: English searches, alt text in the site language, reels defaults

Budget: 2 h. Wiki: `docs/wiki/courses-downloads-media-library-apps.md`.

**Files:**
- Modify the search terms:
  - `backend/apps/core/onboarding/ai_curate.py`: `english_terms`; `brief_query` :89-99 and `photo_query` :104-122 use it.
  - `backend/apps/tenant_config/interview_brief.py:1550`: `subject_of`'s regex becomes Unicode-aware, and its result goes through `english_terms`.
  - `backend/apps/core/curated_images/client.py:431-441`: `logo_query` receives English.
- Modify the alt text:
  - `backend/apps/core/curated_images/cache.py:120-150`: `cache_remote_image`.
  - `backend/apps/core/onboarding/site_composer.py:1912-1975`: `_attach_images`, which translates its batch of descriptions in one call.
  - `backend/apps/media/own_photos.py:161-166`
- Modify the reels defaults:
  - `backend/apps/reels/render.py`:
    - `:37`, the default target: `""` becomes the site language when it differs from `captions_language`;
    - `:231, :239`, the end card falls back to the site language.
  - `backend/apps/reels/moments.py`:
    - `PICK_SYSTEM` :61-66: hook title, label and caption are in the site language (via `Mixed`);
    - the fallback title at `:205-206` uses gettext.
- Test:
  - `backend/apps/core/tests/test_english_terms.py`
  - `backend/apps/core/tests/test_alt_text_language.py`
  - `backend/apps/reels/tests/test_language_defaults.py`

**Interfaces:**
- Produces `english_terms(words: str, *, language: str) -> str`:
  - returns `words` unchanged when `language == "en"`;
  - otherwise makes one `ai.structured(..., language=None)` call that returns 2–6 English search words;
  - cached 30 days in the Django cache, keyed by sha1 of `(language, words)`.
- Produces `translate_descriptions(texts: list[str], language: str) -> list[str]`:
  - the identity for English;
  - otherwise one call with `language=language`, same order and same length.

- [ ] **Step 1: Write the failing tests:**
  - `english_terms("yoga", language="en")` makes no model call;
  - Turkish words go out as the faked English;
  - a second identical call is a cache hit;
  - on a `tr` site, `cache_remote_image` stores the translated description as `alt_text`;
  - a reel on a `de` site whose transcript is `en` defaults its caption target to `de`.
- [ ] **Step 2: Run them (FAIL).** Implement, run them again (PASS). Commit with the message "feat(i18n): searches stay English, alt text and reels follow the site".

### Task 2.4: The visual check reads the language

Budget: 60 min. Wiki: `docs/wiki/tenant-config-site-builder-apps.md`.

**Files:**
- Modify `backend/apps/tenant_config/site_qa.py`:
  - `_page_context` :225 adds the language line below.
  - The confirmations at `:305, :313, :316, :332` become gettext, written in the creator's language (they land in the audit trail).
- Test: `backend/apps/tenant_config/tests/test_site_qa.py` (extend)

**Interfaces:**
- Produces this line in the user turn: `"The site is in {name}. Every visible word that is not {name} is a finding, except brand names and the creator's own words: rewrite_text when it is page content, none when it is interface text."`
  - `fix: none` findings are already logged as `site-qa: open finding` (`run` :423).

- [ ] **Step 1: Write the failing test.** The user turn for a `tr` site contains "The site is in Turkish". A faked finding with `fix: "none"` is logged at WARNING.
- [ ] **Step 2: Run it (FAIL).** Implement, run it again (PASS). Commit with the message "feat(i18n): the visual check flags words in the wrong language".

### Task 2.5: Proof: Turkish and Polish eval briefs

Budget: 60 min plus two eval runs (about 10 min, agy quota). Wiki: `docs/wiki/other-e2e-specs.md`.

**Files:**
- Modify:
  - `e2e/fixtures/site-eval-briefs.json`: add `yoga-tr` (description and follow-ups written in Turkish, `"language": "tr"`) and `chess-pl` (in Polish, `"language": "pl"`).
  - `e2e/specs/91-site-eval.spec.ts`:
    - the `Brief` type :15-22 gains `language?: string`;
    - `judgePrompt` :162-192 adds `language` to the coach JSON, plus the criterion `language_purity`: "Every visible word is in <language>, except brand names and the coach's own words. One interface word in another language is a 6 or lower."
  - `backend/apps/core/management/commands/eval_compose_site.py:137`: `config.default_locale = brief.get("language", "en")`.

- [ ] **Step 1: Make the change.** Run `make eval-sites STYLE=journal BRIEFS=yoga-tr,chess-pl`.
  - Expected: both briefs reach the existing pass bar (average 8.5, floor 7.5), and `language_purity` is at least 9.
- [ ] **Step 2: Record the scores in the commit message.** Commit with the message "test(eval): Turkish and Polish briefs are judged in their language".

---

## Phase 3: contentor.app in four languages

### Task 3.1: `[locale]` routing and the switcher

Budget: 3 h. Wiki: `docs/wiki/marketing-site-app-frontend-main.md`.

**Files:**
- Create:
  - `frontend-main/src/i18n/routing.ts`
  - `frontend-main/src/i18n/navigation.ts`
  - `frontend-main/src/middleware.ts`
  - `frontend-main/src/app/[locale]/layout.tsx`
  - `frontend-main/src/components/shared/language-switcher.tsx`, starting from `git show 0886b80c^:frontend-customer/src/components/shared/language-switcher.tsx`
- Modify:
  - `frontend-main/src/i18n/request.ts`: `requestLocale`.
  - Move with `git mv` into `src/app/[locale]/`: `page.tsx`, `pricing/`, `blog/`, `signup/`, `(auth)/`, `dashboard/`.
  - `platform-header.tsx` and `platform-footer.tsx`: render the switcher.
  - Internal links on those pages: `LocaleNavLink`. Keep the `NavLink` / `useNavigate` convention: the wrapper only localizes the href.
- Test: `frontend-main/src/lib/__tests__/locale-href.test.ts`

**Interfaces:**
- Produces `routing = defineRouting({ locales: enabledLocales(), defaultLocale: "en", localePrefix: "as-needed", localeCookie: { name: "NEXT_LOCALE", maxAge: 31536000 } })`.
  - The middleware's matcher leaves out `/admin`, `/api`, `/_next` and files.
  - Every page response carries `NEXT_LOCALE` = the page's locale. Set it explicitly if next-intl only sets it on a switch.
- Produces `[locale]/layout.tsx`: `notFound()` unless `hasLocale(routing.locales, locale)`.
- Produces `localizedHref(href: string, locale: string): string`: `"/pricing"` with `en` → `"/pricing"`; with `tr` → `"/tr/pricing"`.
- Produces `LocaleNavLink` and `useLocaleNavigate()`.
- Produces `LanguageSwitcher`:
  - lists the enabled locales by native name;
  - rendered nowhere when only one is enabled;
  - links to the same page in the other language.

- [ ] **Step 1: Write the failing test** for `localizedHref`. Run it (FAIL).
- [ ] **Step 2: Implement.** Then run `make typecheck` and `make e2e-changed`. Any frontend-main change runs its 7 specs.
- [ ] **Step 3: Check with curl.**
  - `curl -sI -H 'Accept-Language: tr' http://localhost/` → redirect to `/tr`.
  - `curl -sI http://localhost/` → 200.
  - `curl -sI http://localhost/admin` → unchanged.
- [ ] **Step 4: Commit** with the message "feat(i18n): contentor.app has an address per language and a switcher".

### Task 3.2: SEO

Budget: 90 min. Wiki: `docs/wiki/marketing-site-app-frontend-main.md`.

**Files:**
- Create: `frontend-main/src/lib/seo.ts`
- Modify:
  - every page's `generateMetadata`: translated `title` and `description`, `alternates(path, locale)`, and `openGraph.locale`.
  - `frontend-main/src/app/layout.tsx:62-66`: drop the canonical and `hrefLang` that are pinned to the root.
  - `frontend-main/src/app/sitemap.ts:8`: per-entry `alternates.languages`; the base URL comes from `NEXT_PUBLIC_BASE_DOMAIN`.
- Test: `frontend-main/src/lib/__tests__/seo.test.ts`

**Interfaces:**
- Produces `alternates(path: string, locale: string)` → `{ canonical, languages }`:
  - `canonical`: the localized path;
  - `languages`: an entry for every enabled locale, plus `"x-default"` → the English path.

- [ ] **Step 1: Write the failing test.** With `en,tr` enabled, `alternates("/pricing", "tr")` gives `{canonical: "/tr/pricing", languages: {en: "/pricing", tr: "/tr/pricing", "x-default": "/pricing"}}`. Run it (FAIL).
- [ ] **Step 2: Implement, run it (PASS).** Check `curl -s http://localhost/tr/pricing | grep -o 'hreflang="[^"]*"'`. Commit with the message "feat(i18n): every page tells search engines about its other languages".

### Task 3.3: Signup with a site language, the dashboard, and contentor.app's strings

Budget: 4 h (the extraction is an **agy** batch). Wiki: `docs/wiki/onboarding-wizard-site-ai-frontend-main-src.md`.

**Files:**
- Create `frontend-main/src/lib/site-language.ts`: `siteLanguageOptions(pageLocale: string): { value: string; label: string; selected: boolean }[]`.
- Modify frontend-main:
  - `src/app/[locale]/signup/signup-form.tsx`: a "Site language" select built from `siteLanguageOptions`, over the enabled locales, by native name, defaulting to the page's locale.
  - `src/lib/api/onboarding.ts`: the payload gains `locale` and `site_locale`. The public fetches here set `Accept-Language` to `document.documentElement.lang`, and so do `signup-form.tsx`, `signup/verify/page.tsx`, `components/auth/magic-link-form.tsx` and `help-bubble.tsx`.
- Modify the backend signup:
  - `backend/apps/core/onboarding/views.py`:
    - `creator_signup` :42 and `creator_signup_authenticated` :148 store `tenant.wizard_state["locale"]` and `["site_locale"]`, both resolved, and set the public owner row's `preferred_locale`;
    - `signup_checkout` :306-337 uses the creator's language;
    - the `REGION_DEFAULT_LOCALE` uses at :234/:270 and :306/:314 go.
  - `backend/apps/core/tasks.py`:
    - `provision_tenant` :377-395 reads both values from `tenant.wizard_state`, with `en` as the fallback;
    - `_create_default_config(tenant, site_locale)`;
    - owner rows at :342 and :367 get `preferred_locale` = the creator's language;
    - :422 and :424 use the site's language;
    - the `REGION_DEFAULT_LOCALE` uses at :392/:395 and :648/:657 go.
  - `backend/apps/core/management/commands/seed_dev_tenants.py:51, :194`
- Modify the dashboard:
  - `backend/apps/core/me/views.py:26` `my_tenants`: adds `"language"`, read from each tenant's `TenantConfig` through `schema_context`. Mark it `# ponytail: one schema switch per site; denormalize onto Tenant if a creator ever owns dozens`.
  - frontend-main `[locale]/dashboard/page.tsx`: shows each site's language by native name. A creator who signs in lands on `/<preferred_locale>/dashboard`.
- Extraction (**agy**, with the recipe): frontend-main landing, pricing, blog index, signup, login, verify, callback and dashboard. The ratchet count goes to 0 for `frontend-main/src` outside `admin`.
- Test:
  - `backend/apps/core/tests/test_signup_languages.py`
  - `frontend-main/src/lib/__tests__/site-language.test.ts`

- [ ] **Step 1: Write the failing backend tests.**
  - Signing up with `locale="tr"` and `site_locale="en"` stores both in `wizard_state`.
  - `provision_tenant` gives `TenantConfig.default_locale == "en"`, and both owner rows get `preferred_locale == "tr"`.
  - A hidden `site_locale` becomes `en`.
  - `my_tenants` returns `language`.
- [ ] **Step 2: Write the failing frontend test.** With `en,tr` enabled, `siteLanguageOptions("tr")` gives two options, English and Türkçe, with Türkçe selected.
- [ ] **Step 3: Run them (FAIL).** Implement, run them again (PASS), then the extraction batch.
- [ ] **Step 4: Run `make e2e-spec SPEC=01-signup-onboarding`** once; the English signup is unchanged. The spec imports `frontend-main/messages/en/auth.json` for its selectors, so keep those keys.
- [ ] **Step 5: Commit** in three commits: backend, form plus dashboard, extraction.

### Task 3.4: Creator emails and plan checkout in the creator's language

Budget: 2 h. Wiki: `docs/wiki/billing-payments-backend-apps.md`.

**Files:**
- Modify the emails:
  - `backend/apps/core/onboarding/views.py:66-75`: the verify email is rendered under `override(<payload locale>)`, and its link carries the locale prefix (`/tr/signup/verify?…`).
  - `backend/apps/core/onboarding/recovery.py`:
    - `_COPY` :35-46 and `_ABANDON_COPY` :50-62 become gettext;
    - `send_recovery_email` :197 and `send_abandon_warning` :158 render under `override(wizard_state["locale"])` with prefixed links;
    - `brand_of` :151-155 ("your site").
  - `backend/apps/core/email.py:150-177`: the tagline in `action_email`.
  - `backend/apps/accounts/views.py:42-90`: on contentor.app (public schema), `magic_link_request` sends the creator's sign-in in the creator's language, and must not call the tenant-only `_config()`.
- Modify the checkouts:
  - `backend/apps/billing/views/platform.py:60-79`: `_resolve_locale` becomes `creator_language(user)`; the session gets `metadata.locale`; the `REGION_DEFAULT_LOCALE` use at :34/:79 goes.
  - `backend/apps/billing/views/webhooks_platform.py`: `checkout.session.completed` calls `Customer.modify(preferred_locales=[…])`.
  - `backend/apps/domains/billing.py:10-45`: the locale is the creator's.
  - `backend/apps/billing/providers/bypass_provider.py:79, :88`
- Test: `backend/apps/core/tests/test_creator_emails_language.py`, `backend/apps/billing/tests/test_plan_checkout_locale.py`

- [ ] **Step 1: Write the failing tests.**
  - The verify email for `locale="pl"` has the Polish subject (`translated(..., "pl")`) and a `/pl/` link.
  - The recovery email follows `wizard_state["locale"]`.
  - The apex magic link for a creator with `de` renders German without a tenant schema.
  - Plan checkout sends `locale="de"`, and the webhook sets `preferred_locales`.
- [ ] **Step 2: Run them (FAIL).** Implement, run them again (PASS). Commit with the message "feat(i18n): creators get platform emails and plan checkout in their language".

### Task 3.5: The blog and campaigns per language; the `tr.` redirect

Budget: 2 h. Wiki: `docs/wiki/superadmin-platform-console-apps.md`, `docs/wiki/other-caddyfile.md`.

**Files:**
- Modify the platform blog:
  - `backend/apps/core/models.py:547-577`: `PlatformBlogPost.language`, a `CharField(2)` with `LOCALE_CHOICES` and default `"en"`, plus a migration.
  - `backend/apps/blog/platform_views.py:43-73`:
    - the list takes `?language=`;
    - generate takes `language` and passes it to `blog/ai.py`;
    - `PLATFORM_BRIEF` stays English (it is an instruction).
  - `backend/apps/blog/serializers.py:164-184`
  - frontend-main `src/lib/platform-blog.ts`: the blog pages pass the locale. The header's Blog link is hidden in a locale with no posts: the list fetched with `page_size=1` and `revalidate: 300`.
  - The superadmin blog composer and its CRUD page get a language select. Their UI stays English.
- Modify platform campaigns:
  - `backend/apps/platform_email/recipients.py:16-29`: `recipient_filter` may carry `"language"`; `resolve_recipients` filters on `preferred_locale`, where `""` counts as `en`.
  - `backend/apps/platform_email/views.py:35` and `email_campaigns/brand.py:123`: `platform_kit(language)`.
  - The superadmin campaign form gets a language select.
- Modify `Caddyfile`: `tr.{$CONTENTOR_DOMAIN}` redirects 301 to `{scheme}://{$CONTENTOR_DOMAIN}/tr{uri}`.
- Test: `backend/apps/blog/tests/test_platform_blog_language.py`, `backend/apps/platform_email/tests/test_language_audience.py`

- [ ] **Step 1: Write the failing tests.** `?language=tr` lists only Turkish posts. A `"language": "pl"` filter resolves only Polish creators, and creators with an empty value count as English.
- [ ] **Step 2: Run them (FAIL).** Implement, run them again (PASS).
- [ ] **Step 3: Check the redirect.** Restart Caddy (bind-mounted config), then `curl -sI -H 'Host: tr.localhost' http://localhost/pricing` → `301` to `…/tr/pricing`.
- [ ] **Step 4: Commit** in two commits: blog plus campaigns, redirect.

---

## Phase 4: The Creator studio and `/setup` in the creator's language

### Task 4.1: The creator picks their language

Budget: 90 min. Wiki: `docs/wiki/authentication-accounts.md`.

**Files:**
- Modify `backend/apps/accounts/views.py`:
  - `update_locale` :352-372 accepts enabled codes. It writes the public row and the creator's row in every tenant whose `owner_email` matches, through `schema_context`, then sets the cookie.
  - `_set_locale_cookie` :211-215: creator roles get `creator_language(user)`.
  - `_set_locale_cookie` is also called beside `_set_session_cookie` at `:321`, the impersonation exit.
  - The `REGION_DEFAULT_LOCALE` uses at :103/:116 and :651/:664 go; a student row keeps `preferred_locale=""`.
- Modify `backend/apps/core/region_utils.py:12, :28`: use `languages.DEFAULT`. Then delete `REGION_DEFAULT_LOCALE` and `LOCALE_EN` from `constants.py` once nothing imports them.
- Create `frontend-customer/src/components/shared/language-switcher.tsx`, starting from `git show 0886b80c^:frontend-customer/src/components/shared/language-switcher.tsx`. It becomes a select of the enabled locales, by native name.
- Modify `frontend-customer/src/app/admin/settings/…`: the general settings page renders the switcher as "Your language".
- Test: `backend/apps/accounts/tests/test_update_locale.py`

- [ ] **Step 1: Write the failing tests.**
  - `tr` is accepted when enabled.
  - The public row and the rows in two owned tenants all become `tr`, and the cookie is set.
  - `xx` and a hidden `de` get a 400, whose message is in the request's language.
- [ ] **Step 2: Run them (FAIL).** Implement, run them again (PASS). In the browser, change the language in settings; the studio re-renders in it.
- [ ] **Step 3: Commit** with the message "feat(i18n): the creator picks their language in the studio".

### Task 4.2: The site language: changeable until go-live

Budget: 2 h. Wiki: `docs/wiki/tenant-config-site-builder-apps.md`.

**Files:**
- Create `backend/apps/tenant_config/site_language.py`.
- Modify:
  - `backend/apps/tenant_config/urls.py`: add `config/site-language/` (POST, owner).
  - `backend/apps/core/platform/views.py:203-210`: `platform_tenant_detail` PATCH accepts `default_locale` and calls `change(..., force=True)`.
  - frontend-customer studio settings: a "Site language" select. Once locked it is disabled, with "Your site is live, so its language stays as it is."
  - frontend-main `src/app/admin/tenants/[slug]/page.tsx`: a select, with the English warning "Existing content stays as written."
- Test: `backend/apps/tenant_config/tests/test_site_language.py`

**Interfaces:**
- Produces `is_locked(tenant) -> bool`: `tenant.is_published` or `setup_flow.completed_at` is set (`setup_flow.act` stamps it at :305).
- Produces `change(tenant, code: str, *, force: bool = False) -> None`:
  - a code that is not enabled raises `ValueError`;
  - locked and not `force` raises `SiteLanguageLocked`;
  - otherwise it saves, and unless locked it calls `redraft(tenant)`.
- Produces `redraft(tenant) -> None`:
  - re-applies `build_config_overrides`' labels;
  - `build_page(tenant, page, force=True)` for every built page;
  - `interview_milestones.redraft(tenant, answers, kind, "words")` for every draft in `setup_flow["drafts"]`;
  - replaces the email starters the creator never edited (`starters.ensure`);
  - regenerates the first post when it is unpublished and unedited.

- [ ] **Step 1: Write the failing tests,** with the queueing mocked:
  - a change before go-live saves and queues the redraft;
  - with `is_published`, the endpoint returns 409 with its message;
  - after unpublishing (with `completed_at` set) it is still locked;
  - a superadmin `force` saves and does not redraft.
- [ ] **Step 2: Run them (FAIL).** Implement, run them again (PASS). Commit with the message "feat(i18n): a site's language can change until it goes live".

### Task 4.3: API errors in the reader's language (backend batches, **agy**)

Budget: 4 h, plus review.

**Files:** take every file that has `detail`/`error` text, `ValidationError` or `PermissionDenied` literals to a ratchet count of 0. That is about 222 + 14 + 46 + 2 strings across 67 files, in four batches:
- **(a)** `live/`, `courses/`, `downloads/`, `media/`, `core/uploads/`
- **(b)** `billing/`, `domains/`, `accounts/`, `core/onboarding/`
- **(c)** `email_campaigns/`, `mailbox/`, `notifications/`, `community/`, `blog/`
- **(d)** `tenant_config/`, `core/copilot/`, `reels/`, `core/focus/`, and the rest

Machine codes (`{"error": "PLAN_RUNNING"}`) stay as they are.

- [ ] **Step 1: For each batch,** brief agy with the backend recipe, review the diff, then run `make translate`, `i18n_check --update` and the touched apps' tests (`make test-changed`).
- [ ] **Step 2: Each batch adds one test, `test_errors_follow_the_creator_language`.** One endpoint per batch, called with an owner JWT and `user-locale=tr`, answers `translated(<its message>)`.
- [ ] **Step 3: One commit per batch** ("feat(i18n): <apps> errors speak the reader's language").

### Task 4.4: The setup interview's fixed copy

Budget: 3 h. Wiki: `docs/wiki/onboarding-wizard-site-ai-backend-apps.md`. Peers edit these files daily, so make small commits and rebase before each one.

**Files:**
- Modify:
  - `backend/apps/tenant_config/interview_brief.py`: `FIELDS`, questions, help text.
  - `interview.py`: the fixed acks, e.g. `COVER_ACK` and `REDRAFT_ACK`.
  - `interview_team.py`: the `handoff` copy at :24.
  - `setup_flow.py`, `interview_golive.py`, `interview_milestones.py`: their creator-facing fixed copy.
  - `notifications/transactional.py:24-28`: the `STYLES` labels, which the creator sees in setup.
  - The creator-facing fixed copy under `core/focus/` (its questions and acks) and in `tenant_config/logo_*.py`.
- Take each of these files to a ratchet count of 0. Copy sent through the setup API follows the request's language (the creator's). Copy written by Celery runs under `override(creator_language())`.
- Test: `backend/apps/tenant_config/tests/test_interview_copy_language.py`

- [ ] **Step 1: Write the failing test.** The setup-flow state API, with an owner JWT and `user-locale=tr`, returns question texts equal to their Turkish msgstrs. Run it (FAIL).
- [ ] **Step 2: Implement in small commits,** each one running `make translate` and the interview tests. Then run the test (PASS).

### Task 4.5: Studio screens and shared editors (**agy**, five batches)

Budget: 8 h, plus review.

**Files** (each batch ends with a ratchet count of 0 for its files):
- **(a)** frontend-customer `src/app/admin/**`
- **(b)** `src/components/admin/**`, `src/components/owner/**`
- **(c)** `src/components/setup-flow/**`, `src/app/setup/**`
- **(d)** `src/components/{logo,reels,cx}/**`, the video studio, and the creator-facing parts of `community/`
- **(e)** packages/shared `email/**`, `admin-kit/**`, `logo/**`, `mailbox/**`, and creator-facing `ui/**`, into the `studio` namespace. frontend-main's `/admin` already loads `studio` in English (Task 0.3).

This also covers the studio plural ternaries the research found:
- `admin/messages/email/[id]/send/page.tsx:232`
- `admin/students/page.tsx:128, :194`
- `media-browser.tsx:418`
- `course-form.tsx:947, :1191`
- `email/recipient-selector.tsx:254`
- `announcement-compose.tsx:543`
- `calendar/unified-calendar.tsx:434`
- `logo/studio-chat.tsx:574`
- `refine-prompt-box.tsx:79`
- `golive-panel.tsx:240`
- `go-live-card.tsx:382`
- `setup-flow/photos-screen.tsx:412`

- [ ] **Step 1: For each batch,** brief agy with the recipe, review, then run the recipe's step 6 and `make e2e-changed`. One commit per batch.
- [ ] **Step 2: After batch (e), walk the studio** with the creator language `de` at 390 px wide: nav, tabs, settings, the email editor. Note the overflows for Task 6.1.

### Task 4.6: Creator-facing stored text and pushes

Budget: 90 min. Wiki: `docs/wiki/ai-infrastructure-assistants-backend-apps.md`.

**Files:**
- Modify:
  - `backend/apps/core/copilot/views.py:443` `_audit_summary`: gettext. `_record_audit` (:514-538) writes under `override(creator_language(<acting user or owner>))`, so its callers (`focus/covers.py:313`, `site_qa.py:361`, `media/design_views.py:210`) all get it.
  - `backend/apps/email_campaigns/tasks.py:44-62, :167`: `recipient_summary`.
  - `backend/apps/core/contact/views.py:86`: the mailbox subject, in the owner's language.
  - `backend/apps/blog/tasks.py:67-74, :90-91, :141, :143`: the creator pushes, under the owner's language.
- Test: `backend/apps/core/tests/test_creator_stored_text.py`

- [ ] **Step 1: Write the failing test.** On a `tr` site whose owner is `de`, a copilot action's audit summary is German, and a contact-form message's subject is German. Run it (FAIL).
- [ ] **Step 2: Implement, run it (PASS).** Commit with the message "feat(i18n): what the studio records for the creator is in their language".

### Task 4.7: Proof: a Turkish creator from contentor.app/tr to live

Budget: 2 h plus one real-AI run (about 20 min).

**Files:** modify `e2e/specs/43-site-in-turkish.spec.ts` and add the test "a Turkish creator goes from contentor.app/tr to live". Reuse `signupThroughVerify` and `grantTrial` from `01-signup-onboarding.spec.ts` (move them to `e2e/helpers/` if they're not exported). Use `retries: 0` and a 20-minute timeout, as `01` does.

- [ ] **Step 1: Write the test.**
  - Sign up at `/tr/signup`; the site language defaults to `tr`.
  - The verify email's subject is Turkish.
  - Run `/setup` with Turkish answers (an `ownWords` closure like 01's).
  - Go live.
  - On the studio home, settings and courses, `englishLeaks` against the English `admin.json` is `[]`.
  - Then test 1's student path runs on this new site.
- [ ] **Step 2: Run `make e2e-spec SPEC=43-site-in-turkish`.** Commit with the message "test(e2e): a Turkish creator goes live without meeting English".

---

## Phase 5: Live rooms

### Task 5.1: LiveCraft rooms in four languages (repo `../livecraft`)

Budget: 3 h. Read LiveCraft's `AGENTS.md` first; it has uncommitted peer files (`AGENTS.md`, `docs/permissions.md`, `e2e/abuse-controls.spec.ts`), so don't touch them.

**Files** (in `../livecraft`):
- Create:
  - `src/lib/i18n.ts`
  - `messages/{en,tr,de,pl}/room.json`
- Modify:
  - `src/app/api/v1/rooms/[room]/join/route.ts:22-48`: accept `lang`.
  - `src/lib/rooms.ts:264-267`: `joinUrl` builds `#token=…&lang=<lang>`.
  - `src/components/room-session.tsx:58`: parse `lang` and set `document.documentElement.lang`.
  - The strings in `src/components/*.tsx`, densest first: poll-panel, room-session, stream-host-view, stream-viewer-view, control-bar.
  - Check the LiveKit prefab components for built-in English, and replace any visible text.
- Test: `src/lib/__tests__/i18n.test.ts`

**Interfaces:**
- Produces:
  - `useT(): (key: string, vars?: Record<string, string | number>) => string`, whose lang comes from the room's fragment (English if unknown);
  - `plural(lang: string, n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>>): string`, using `new Intl.PluralRules(lang)`.

- [ ] **Step 1: Write the failing tests:**
  - every language has the same keys as `en`;
  - `plural("pl", 5, …)` picks `many`, and `plural("pl", 2, …)` picks `few`;
  - an unknown `lang` gives English.
- [ ] **Step 2: Run them (FAIL).** Implement.
- [ ] **Step 3: Draft from the contentor repo** with `python3 scripts/translate.py --root ../livecraft/messages`. Run LiveCraft's `make test` and `make e2e`.
- [ ] **Step 4: Commit in livecraft** with the message "feat(i18n): rooms speak the language the join link asks for".

### Task 5.2: Contentor passes the language on join

Budget: 45 min. Wiki: `docs/wiki/live-events-calendar-apps.md`.

**Files:**
- Modify:
  - `backend/apps/live/livecraft.py:76-82`: `join_url(room, user, *, role, lang)` posts `lang`; the dev fake ignores it.
  - `backend/apps/live/views.py:67-91` `_join_response`: a host gets `creator_language(user)`, anyone else `site_language()`. The errors at `:81, :88, :90` use gettext.
- Test: `backend/apps/live/tests/test_join_lang.py`

- [ ] **Step 1: Write the failing test,** with `requests.post` mocked: a student on a `tr` site posts `lang="tr"`; a host whose language is `de` posts `lang="de"`. Run it (FAIL).
- [ ] **Step 2: Implement, run it (PASS).** Commit with the message "feat(i18n): live sessions open in each person's language".

---

## Phase 6: Translation pass and review

### Task 6.1: Drafts for everything; German at phone width

Budget: 3 h.

- [ ] **Step 1: Run `make translate`, then `make lint`.** Expected: clean.
- [ ] **Step 2: Take German screenshots at 390 px.** Set demo-yoga to `de`, with the creator language `de`.
  - Public pages: `make design-shots TENANTS=demo-yoga LABEL=de`.
  - The busiest studio screens, by hand through the browser sidecar: nav, the pricing cards on contentor.app/de/pricing, the studio's tabs, settings, the email editor.
- [ ] **Step 3: Fix every overflow** the screenshots and Task 4.5's notes show:
  - wrap or truncate with a `title`;
  - headings get `hyphens: auto`, which works because `lang` is right.

  Take the screenshots again, then commit with the message "fix(i18n): German fits on a phone".

### Task 6.2: Turkish review and launch

- [ ] **Step 1: Hand over the Turkish review.**
  - Run `make translate-export TO=tr` and send `i18n-review-tr.csv` to the owner.
  - After the review, run `make translate-import FILE=i18n-review-tr.csv`, then `make lint`.
- [ ] **Step 2: Run the full spec,** `make e2e-spec SPEC=43-site-in-turkish`.
- [ ] **Step 3: Launch, on the owner's go.**
  1. `~/ws/home-server/scripts/secrets.sh set contentor ENABLED_LOCALES en,tr`
  2. `make deploy`. It builds the Next images with the enabled list baked in, and the Django image compiles the `.mo` files.
- [ ] **Step 4: Check prod.**
  - `curl -sI https://contentor.app/tr` → 200.
  - `curl -sI https://tr.contentor.app/` → 301 to `/tr`.
  - The signup form offers Türkçe.
  - The existing English sites are unchanged; spot-check two.

### Task 6.3: German and Polish reviews and launch

- [ ] **Step 1: Run Task 6.2 for each language** once its native reviewer is done (the owner finds the reviewers). The `ENABLED_LOCALES` value grows one language at a time.
  - **German** waits on the legal pages (Impressum, privacy, terms), which the spec flags outside this project.

---

## Self-check against the spec

- **Spec sections, mapped to tasks:**
  - Two languages and the data model: Tasks 0.1, 0.2, 4.1, 4.2.
  - contentor.app: Tasks 3.1–3.5.
  - The coach app: Tasks 0.3, 1.2, 1.3, 4.5.
  - Shared package: Tasks 0.3, 1.2, 4.5.
  - Backend: Tasks 0.2, 1.4, 1.5, 4.3, 4.4, 4.6.
  - AI writing: Tasks 2.1–2.5.
  - Formatting and typography: Tasks 0.6–0.8, 6.1.
  - Emails and Stripe: Tasks 1.5, 1.6, 3.4.
  - LiveCraft: Tasks 5.1, 5.2.
  - PWA and push: Tasks 1.2, 1.5, 4.6.
  - Translation workflow and extensibility: Tasks 0.4, 0.5.
  - Testing: Tasks 1.7, 2.5, 4.7, 6.1.
  - Rollout: Tasks 6.2, 6.3.
- **Where the plan departs from the spec:** see "Calls this plan makes beyond the spec". That covers request language, file location, Scribe, Pix4Less terms, the student time zone, `TO=`, and the lock rule.
