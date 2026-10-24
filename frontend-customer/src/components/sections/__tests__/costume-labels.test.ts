import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Character over costume (spec R5): no decorative words that read as content or
// jargon ("ACT 01 //", "FIG. 01", "Track 02", "session.raw"). A bare numeral that
// counts real items stays; the prop-word in front of it goes.
const sectionsDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Comments are prose about the style, not what a visitor reads. Only a block
 *  comment that opens a line (or sits alone in a JSX `{/* ... *\/}`) and whole
 *  `//` lines are stripped, so a string such as `{"/**"}` cannot hide real JSX. */
const stripComments = (s: string) =>
  s
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const read = (dir: string, names: string[], prefix = "") =>
  names
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({
      name: `${prefix}${f}`,
      text: stripComments(readFileSync(join(dir, f), "utf8")),
    }));

const entries = readdirSync(sectionsDir, { withFileTypes: true });
// The style folders, and the shared .tsx files at the root (kit, rows, layouts).
const files = [
  ...read(
    sectionsDir,
    entries.filter((e) => e.isFile()).map((e) => e.name),
  ),
  ...entries
    .filter((e) => e.isDirectory() && e.name !== "__tests__")
    .flatMap((d) =>
      read(
        join(sectionsDir, d.name),
        readdirSync(join(sectionsDir, d.name)),
        `${d.name}/`,
      ),
    ),
];

/** Every "style/file: match" line for `re` over the files whose name matches `only`. */
const hits = (re: RegExp, only = /./) => {
  const all = new RegExp(re.source, `${re.flags}g`);
  return files
    .filter((f) => only.test(f.name))
    .flatMap((f) => [...f.text.matchAll(all)].map((m) => `${f.name}: ${m[0]}`));
};

describe("costume labels", () => {
  it("reads the style folders", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no act, cue or stage tags in front of a kicker", () => {
    expect(hits(/\bACT 0|\bcue=/)).toEqual([]);
  });

  it("no setlist, set, figure, track, stamp or side words", () => {
    expect(
      hits(
        /\bsetlist\b|ENTER SET|\bFIG\.|\btrack (?:\d|\{)|trail\s*<br \/>\s*head|\bSide [AB]\b|Summit\s*<br \/>\s*reached|Lace\s*<br \/>\s*up|Summit reached|Lace up/i,
      ),
    ).toEqual([]);
  });

  it("no pass, ticket or issue-tracker props: STUDIO PASS, TEAR HERE, CURRENT PASS, Enrolment slip, NEW ISSUE", () => {
    expect(
      hits(
        /STUDIO PASS|TEAR HERE|CURRENT PASS|Enrolment slip|NEW ISSUE|Submit new issue/i,
      ),
    ).toEqual([]);
  });

  it("no dev jargon or fake status in the terminal style", () => {
    // --feat_01, (HEAD -> stage_01), MODE: 0755, NEXT RUN, build: passing, [OK], verified module, ...
    expect(
      hits(
        /--feat_|HEAD -(?:&gt;|>)|MODE:|NEXT RUN|SCHEDULER:|build: passing|license: open|branch: main|assignee_email|sla_response|\[OK\]|verified module|--recommended|FAKE_HASHES|Signed-off-by|Background & Philosophy|QUICKSTART|ls -la|\/\/ overview|@author|crontab|MANUAL\(|SYNOPSIS|OPTIONS &|--includes|\[ACTIVE\]|Inspect details|-q\{pad|"(?:calendar|courses)\/"/,
        /^terminal\//,
      ),
    ).toEqual([]);
  });

  it("no plan is labelled popular, featured or a favourite (S3): nothing says which one is", () => {
    // SubscriptionPlan has no coach-set featured field, so a badge is a guess.
    // A highlight with no words may stay. Identifiers (isFeatured, featured) are
    // lower-case or prefixed and do not match; sprout's "Family Favourite" and
    // sanctum's "Featured" were the last two.
    expect(
      hits(
        /most popular|(?:family|crowd|fan|customer|student)s?['\u2019]? favou?rite|best[ -]?(?:value|seller)|top pick|our pick/i,
      ),
    ).toEqual([]);
    expect(
      hits(
        /(?<!\w)(?:Featured|Recommended|Popular|FEATURED|RECOMMENDED|POPULAR)(?!\w)/,
      ),
    ).toEqual([]);
  });

  it("no document-jargon head words or invented fallbacks (R5, S3)", () => {
    // ledger running-head marks, a lone section sign, "Produced by", "SESSION INQUIRY",
    // and a location nobody gave ("Studio Floor").
    expect(
      hits(
        /right="(?:Principle|Correspondence|Memorandum|Signed|Appendix)"|§ ?\d|Produced by|SESSION INQUIRY|\bQ\{i|\|\| "Studio Floor"/,
        /^(ledger|encore|studiofloor)\//,
      ),
    ).toEqual([]);
  });

  it("no prop word in front of an index number", () => {
    // "No. 01", "Plate 02", "Edition 03", "MOVE 01", "CUE 02", "PHASE 01", "Waypoint 01", ...
    expect(
      hits(
        /\b(?:No\.|Plate|Edition|Move|Cue|Phase|Waypoint|Route|Pass|Permit|Unit|CH|Mirror|Exercise) ?(?:\d|\{pad)/i,
        /^(darkroom|grid|ledger|journal|primer|studiofloor|terminal|encore|trail)\//,
      ),
    ).toEqual([]);
  });

  it("no file names in the terminal's window bars (session.raw, inspect.png)", () => {
    expect(hits(/session\.raw|inspect\.png/)).toEqual([]);
  });

  it("no title or tag text on a window bar, only its dots", () => {
    expect(hits(/<WindowChrome\b[^>]*\b(?:title|tag)=/)).toEqual([]);
  });

  it("no '$ ' or '--' prefix in front of the terminal buttons", () => {
    expect(hits(/^\s*(?:\$|--)\s*$/m, /^terminal\/(hero|cta)\.tsx$/)).toEqual(
      [],
    );
  });

  it("no lone 'Detail' caption under a hero print", () => {
    expect(hits(/^\s*Detail\s*$/m)).toEqual([]);
  });

  it("no index tabs (A1, A2, B1) at the page edge", () => {
    expect(hits(/["'](?:A1|A2|B1)["']|"No\. [12]"|>No\. [12]</)).toEqual([]);
  });
});
