import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Character over costume (spec R5): no decorative words that read as content or
// jargon ("ACT 01 //", "FIG. 01", "Track 02", "session.raw"). A bare numeral that
// counts real items stays; the prop-word in front of it goes.
const sectionsDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Comments are prose about the style, not what a visitor reads. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const files = readdirSync(sectionsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "__tests__")
  .flatMap((d) =>
    readdirSync(join(sectionsDir, d.name))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => ({
        name: `${d.name}/${f}`,
        text: stripComments(readFileSync(join(sectionsDir, d.name, f), "utf8")),
      })),
  );

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

  it("no setlist, set, figure, track or trail-head words", () => {
    expect(
      hits(
        /\bsetlist\b|ENTER SET|\bFIG\.|\btrack (?:\d|\{)|trail\s*<br \/>\s*head/i,
      ),
    ).toEqual([]);
  });

  it("no prop word in front of an index number", () => {
    // "No. 01", "Plate 02", "Edition 03", "MOVE 01", "CUE 02", "PHASE 01", "Waypoint 01", ...
    expect(
      hits(
        /\b(?:No\.|Plate|Edition|Move|Cue|Phase|Waypoint|Route|Pass|Unit|CH|Mirror) ?(?:\d|\{pad)/i,
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
