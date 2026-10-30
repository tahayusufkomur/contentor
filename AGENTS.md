## Text and languages (en, tr, de, pl)

Enforced by `scripts/check-i18n.mjs` and `manage.py i18n_check` in `make lint`. Never hard-code text a person reads; English is the source.

- **Namespaces by reader:** `site` (visitors and students, section kits, block placeholders) and `studio` (creator-facing shared components) live in `packages/shared/src/i18n/messages`; `admin`, `student`, `pwa`, `common` in `frontend-customer/messages`; `marketing`, `pricing`, `auth`, `common` in `frontend-main/messages`.
- **Keys** are camelCase and name the meaning (`emptyCourses`, not `noPublishedCoursesYet`); a repeated placeholder shares one key. Never glue sentence pieces; one key per sentence.
- **Counts** are ICU: `{count, plural, one {# course} other {# courses}}`; never `n === 1 ? …`. Variables are `{name}`.
- **Dates, numbers, money:** `useFormatter()` / `getFormatter()` or `lib/format.ts` with the active locale; never `"en-US"`, never `undefined`. Upper-case with CSS or `toLocaleUpperCase(locale)`.
- **Backend:** `from django.utils.translation import gettext as _` (`gettext_lazy` at module level, `ngettext`, `pgettext`), literals only with `%(name)s`, never an f-string. Rename throwaway `_` targets (`x, _created = …`). Outside a request (Celery, emails, AI, beat) wrap the work in `translation.override(site_language())` for students or `override(creator_language(user))` for the creator (`apps.core.languages`).
- **AI:** `apps.core.ai` calls take `language=`: the site language for what visitors read, the creator's for what the creator reads. Pix4Less queries and image prompts stay English.
- **Never** list the locale codes in code: use `packages/shared/src/i18n/locales` and `apps.core.languages` (`# not-site-locales` marks a list of something else).
- **After adding or changing English, run `make translate`** (drafts `tr`, `de`, `pl`, marked unreviewed). After removing hard-coded text, lower the ratchets: `node scripts/check-i18n.mjs --update` and `docker compose exec -T django python manage.py i18n_check --update`.
- Voice is informal (`du`, `ty`, `sen`); terms follow `docs/GLOSSARY.md` (creator, platform, live session).

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **contentor** (30192 symbols, 64475 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/contentor/context` | Codebase overview, check index freshness |
| `gitnexus://repo/contentor/clusters` | All functional areas |
| `gitnexus://repo/contentor/processes` | All execution flows |
| `gitnexus://repo/contentor/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
