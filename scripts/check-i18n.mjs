#!/usr/bin/env node
// scripts/check-i18n.mjs: the i18n guards of `make lint` (docs/superpowers/specs/2026-10-28-four-languages-design.md).
//
//   node scripts/check-i18n.mjs [--update] [--self-test] [--dry-run]
//
// 1. Completeness: every messages root x every language in locales.json (not only the enabled ones)
//    has every namespace file, English's flattened keys, the same ICU arguments and tags, and a
//    review entry whose `src` is the hash of today's English. `make translate` fixes all of it.
// 2. Ratchet: counts hard-coded UI literals per file (TypeScript syntax tree) against scripts/i18n-baseline.json.
// 3. Locale lists: no array literal outside packages/shared/src/i18n/ holds two or more locale codes.
//
// `flatten`, `isData` and `tokens` are twins of scripts/translate.py (flatten, _is_data, tokens): keep them in step.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(join(ROOT, "frontend-customer/package.json"))("typescript");

const MESSAGE_ROOTS = ["frontend-main/messages", "frontend-customer/messages", "packages/shared/src/i18n/messages"];
const SRC_ROOTS = ["frontend-main/src", "frontend-customer/src", "packages/shared/src"];
const LOCALES_FILE = "packages/shared/src/i18n/locales.json";
const LOCALE_HOME = "packages/shared/src/i18n/";
const BASELINE = "scripts/i18n-baseline.json";
const DEFAULT = "en";

// Skipped by the ratchet (relative to the repo root).
const SKIP = [
  /^frontend-main\/src\/app\/\(admin\)\/admin\//, // superadmin stays English
  /^frontend-main\/src\/components\/admin\//,
  /^frontend-customer\/src\/app\/design-showcase\//,
  /^frontend-customer\/src\/components\/sections\/fixtures\.ts$/,
  /(^|\/)__tests__\//,
  /\.test\.[tj]sx?$/,
  /\.d\.ts$/,
];
const isTest = (name) => /(^|\/)__tests__\/|\.test\.[tj]sx?$/.test(name);
// Props whose literal value is text a person reads (chosen from the --dry-run top 20).
const PROPS = new Set([
  "label", "placeholder", "title", "aria-label", "alt", "loadingText", "description", "emptyText",
  "confirmText", "cancelText", "tooltip",
  // from the top-20 dry run: user-facing and not in the first list
  "text", "heading", "subheading", "buttonText", "errorToast", "q", "a",
  "hint", "ctaText", "linkText", "helpText", "emptyMessage",
]);
const TOAST_METHODS = new Set(["success", "error", "info", "warning", "message"]);

// ---------- completeness ----------

const IDENT = /^[a-z][A-Za-z0-9]*$/;
const isData = (node) => Array.isArray(node) && node.length > 1 && node.every((x) => typeof x === "string" && IDENT.test(x));

/** {"a": {"b": "x", "c": ["y"]}} -> {"a.b": "x", "a.c.0": "y"}. A list of bare identifiers is data, not text. */
export function flatten(node, prefix = "") {
  if (Array.isArray(node)) {
    if (isData(node)) return {};
    return flatten(Object.fromEntries(node.map((v, i) => [String(i), v])), prefix);
  }
  if (node !== null && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) Object.assign(out, flatten(value, prefix ? `${prefix}.${key}` : key));
    return out;
  }
  return { [prefix]: node };
}

const W = "[\\p{L}\\p{N}_]";
const sorted = (list) => [...list].sort();
/** What a translation must keep: ICU argument names, tags and printf placeholders (twin of translate.py `tokens`). */
export function tokens(raw) {
  // a plural branch (`one {Continue}`, `=0 {..}`) is text, not an argument
  const text = String(raw).replace(new RegExp(`(?:(?<!${W})(?:zero|one|two|few|many|other)|=\\d+)\\s*\\{`, "gu"), "[");
  const args = sorted(new Set([...text.matchAll(new RegExp(`\\{\\s*(${W}+)\\s*[,}]`, "gu"))].map((m) => m[1])));
  const tags = sorted(text.match(/<\/?\w+\s*\/?>/g) ?? []);
  const printf = sorted(text.match(/%\(\w+\)[sd]|%[sd]/g) ?? []);
  return JSON.stringify([args, tags, printf]);
}

const digest = (text) => createHash("sha1").update(String(text), "utf8").digest("hex").slice(0, 8);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const jsonFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []);

/** Problems of one messages root (a directory holding en/, <lang>/ and <lang>.review.json) for `langs`. */
export function completeness(root, langs) {
  const problems = [];
  const english = {};
  const namespaces = jsonFiles(join(root, DEFAULT));
  for (const file of namespaces) {
    const ns = file.replace(/\.json$/, "");
    for (const [key, value] of Object.entries(flatten(readJson(join(root, DEFAULT, file))))) english[`${ns}.${key}`] = value;
  }
  for (const lang of langs) {
    const where = `${root}/${lang}`;
    const values = {};
    for (const file of namespaces) {
      const path = join(root, lang, file);
      if (!existsSync(path)) {
        problems.push(`${where}/${file}: file missing`);
        continue;
      }
      const ns = file.replace(/\.json$/, "");
      for (const [key, value] of Object.entries(flatten(readJson(path)))) values[`${ns}.${key}`] = value;
    }
    for (const file of jsonFiles(join(root, lang))) {
      if (!namespaces.includes(file)) problems.push(`${where}/${file}: no such namespace in English`);
    }
    const reviewPath = join(root, `${lang}.review.json`);
    const review = existsSync(reviewPath) ? readJson(reviewPath) : {};
    if (!existsSync(reviewPath)) problems.push(`${root}/${lang}.review.json: file missing`);
    for (const key of Object.keys(values)) {
      if (!(key in english)) problems.push(`${where}: ${key}: key English does not have`);
    }
    for (const [key, text] of Object.entries(english)) {
      if (!(key in values)) {
        problems.push(`${where}: ${key}: missing`);
        continue;
      }
      const got = values[key];
      if (typeof got !== "string" || got.trim() === "") problems.push(`${where}: ${key}: empty`);
      else if (tokens(text) !== tokens(got)) problems.push(`${where}: ${key}: placeholders or tags differ from the English`);
      const entry = review[key];
      if (!entry) problems.push(`${where}: ${key}: no review entry`);
      else if (entry.src !== digest(text)) problems.push(`${where}: ${key}: English changed since it was translated`);
    }
  }
  return problems;
}

// ---------- the syntax tree: literals and locale lists ----------

const letters = (text) => (text.match(/\p{L}/gu) ?? []).length;
const isText = (text) => letters(text) >= 2;

function parse(text, fileName) {
  const kind = fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
}

/** The text literals an expression can evaluate to directly: itself, a conditional's branches, `a || "x"`. */
function literalsIn(node, out = []) {
  if (!node) return out;
  switch (node.kind) {
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      out.push(node.text);
      break;
    case ts.SyntaxKind.TemplateExpression:
      out.push([node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" "));
      break;
    case ts.SyntaxKind.ConditionalExpression:
      literalsIn(node.whenTrue, out);
      literalsIn(node.whenFalse, out);
      break;
    case ts.SyntaxKind.BinaryExpression:
      if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) {
        literalsIn(node.left, out);
        literalsIn(node.right, out);
      }
      break;
    case ts.SyntaxKind.ParenthesizedExpression:
    case ts.SyntaxKind.AsExpression:
    case ts.SyntaxKind.NonNullExpression:
      literalsIn(node.expression, out);
      break;
    default:
  }
  return out;
}

const propName = (name) => (name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : null);
const isT = (callee) => (ts.isIdentifier(callee) && callee.text === "t") || (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "t");

function toastCall(callee) {
  if (ts.isIdentifier(callee)) return callee.text === "toast";
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "toast" && TOAST_METHODS.has(callee.name.text);
}

/** Hard-coded UI literals in one file's source -> {n, props: Map(prop -> count of capitalised literals)}. */
export function scan(text, fileName = "x.tsx") {
  let n = 0;
  const props = new Map();
  const seen = (prop, literal) => {
    if (/^\p{Lu}/u.test(literal.trim())) props.set(prop, (props.get(prop) ?? 0) + 1);
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && isT(node.expression)) return; // nothing inside t(...) counts
    if (node.kind === ts.SyntaxKind.JsxText) {
      if (isText(node.text.replace(/&#?\w+;/g, ""))) n++;
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText();
      const init = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      for (const literal of literalsIn(init)) {
        if (isText(literal)) {
          seen(name, literal);
          if (PROPS.has(name)) n++;
        }
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = propName(node.name);
      if (name) {
        for (const literal of literalsIn(node.initializer)) {
          if (isText(literal)) {
            seen(name, literal);
            if (PROPS.has(name)) n++;
          }
        }
      }
    } else if (ts.isCallExpression(node) && toastCall(node.expression) && node.arguments.length) {
      for (const literal of literalsIn(node.arguments[0])) if (isText(literal)) n++;
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(text, fileName));
  return { n, props };
}

/** Locale codes that sit together in one array literal -> the offending line numbers.
 *  A `// not-site-locales` comment on one of its lines marks a list of something else (caption languages). */
export function localeLists(text, codes, fileName = "x.ts") {
  const source = parse(text, fileName);
  const lines = [];
  const visit = (node) => {
    if (ts.isArrayLiteralExpression(node)) {
      const found = new Set(node.elements.filter((e) => ts.isStringLiteralLike(e) && codes.includes(e.text)).map((e) => e.text));
      const first = source.getLineAndCharacterOfPosition(node.getStart()).line;
      const last = source.getLineAndCharacterOfPosition(node.getEnd()).line;
      const marked = text.split("\n").slice(first, last + 1).some((line) => line.includes("not-site-locales"));
      if (found.size >= 2 && !marked) lines.push(first + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lines;
}

// ---------- the repo ----------

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const rel = (path) => relative(ROOT, path).split("\\").join("/");
const sortObject = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

function repoFiles() {
  return SRC_ROOTS.flatMap((dir) => walk(join(ROOT, dir))).map((path) => ({ path, name: rel(path) }));
}

function countAll(files) {
  const counts = {};
  const props = new Map();
  for (const { path, name } of files) {
    if (SKIP.some((re) => re.test(name))) continue;
    const found = scan(readFileSync(path, "utf8"), path);
    if (found.n) counts[name] = found.n;
    for (const [prop, c] of found.props) props.set(prop, (props.get(prop) ?? 0) + c);
  }
  return { counts, props };
}

/** Compare counts with the baseline -> {higher: [...], lower: [...]}. */
export function ratchet(counts, baseline) {
  const higher = [];
  const lower = [];
  for (const name of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
    const now = counts[name] ?? 0;
    const was = baseline[name] ?? 0;
    if (now > was) higher.push(`${name}: ${now} hard-coded text(s), baseline ${was}`);
    else if (now < was) lower.push(`${name}: ${now}, baseline ${was}`);
  }
  return { higher, lower };
}

/** The baseline after --update: only lower counts and removed files; the full counts when there is none. */
export function updated(counts, baseline) {
  if (!baseline) return sortObject(counts);
  const out = {};
  for (const [name, was] of Object.entries(baseline)) {
    const now = counts[name] ?? 0;
    if (now > 0) out[name] = Math.min(now, was);
  }
  return sortObject(out);
}

function main(argv) {
  const data = readJson(join(ROOT, LOCALES_FILE));
  const codes = data.locales.map((l) => l.code);
  const files = repoFiles();
  const { counts, props } = countAll(files);

  if (argv.includes("--dry-run")) {
    const top = [...props].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log("props holding capitalised literals (JSX attributes and object properties):");
    for (const [prop, c] of top) console.log(`${String(c).padStart(6)}  ${prop}${PROPS.has(prop) ? "" : "   (not counted)"}`);
    console.log(`\n${Object.keys(counts).length} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} literals counted`);
    return 0;
  }

  const baselinePath = join(ROOT, BASELINE);
  const baseline = existsSync(baselinePath) ? readJson(baselinePath) : null;
  if (argv.includes("--update")) {
    writeFileSync(baselinePath, `${JSON.stringify(updated(counts, baseline), null, 2)}\n`);
    console.log(`${BASELINE} ${baseline ? "lowered" : "written"}`);
    return 0;
  }

  let failed = false;
  const fail = (title, lines, hint) => {
    failed = true;
    console.error(`\n${title}`);
    for (const line of lines.slice(0, 60)) console.error(`  ${line}`);
    if (lines.length > 60) console.error(`  ... and ${lines.length - 60} more`);
    console.error(hint);
  };

  const missing = MESSAGE_ROOTS.flatMap((root) => completeness(join(ROOT, root), codes.filter((c) => c !== DEFAULT)).map((p) => p.replace(`${ROOT}/`, "")));
  if (missing.length) fail("i18n: the messages are incomplete or stale:", missing, "run `make translate`");

  const { higher, lower } = ratchet(counts, baseline ?? {});
  if (higher.length) fail("i18n: hard-coded text added:", higher, "move the text to messages: see CLAUDE.md 'Text and languages'");
  if (lower.length) fail("i18n: hard-coded text removed (good):", lower, "run `node scripts/check-i18n.mjs --update`");

  const lists = [];
  for (const { path, name } of files) {
    if (name.startsWith(LOCALE_HOME) || isTest(name)) continue; // tests assert on the lists
    for (const line of localeLists(readFileSync(path, "utf8"), codes, path)) lists.push(`${name}:${line}`);
  }
  if (lists.length) fail("i18n: a locale list outside packages/shared/src/i18n/:", lists, "import the list from @shared/i18n/locales");

  if (!failed) console.log(`i18n OK (${Object.values(counts).reduce((a, b) => a + b, 0)} hard-coded texts left in ${Object.keys(counts).length} files)`);
  return failed ? 1 : 0;
}

// ---------- self test ----------

function selfTest() {
  const eq = (got, want, what) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };
  const count = (src) => scan(src).n;
  eq(count("const a = <p>Hello world</p>"), 1, "jsx text");
  eq(count('const a = <Input placeholder="Email" />'), 1, "placeholder");
  eq(count('const a = <p>{t("x")}</p>'), 0, "t()");
  eq(count('toast.success("Saved")'), 1, "toast.success");
  eq(count('toast("Saved")'), 1, "toast()");
  eq(count('toast.success(t("saved"))'), 0, "toast with t");
  eq(count('const a = <div className="h-4" />'), 0, "className");
  eq(count("const a = <p>{x} / {y}</p>"), 0, "punctuation only");
  eq(count("const a = <p>&copy; </p>"), 0, "entity only");
  eq(count('const a = <Foo label={ok ? "Yes" : "No"} />'), 2, "conditional branches");
  eq(count("const a = <Foo title={`Hello ${name}`} />"), 1, "template");
  eq(count('const a = { label: "Courses" }'), 1, "object property");
  eq(count('const a = { label: t("x", { title: "Not counted" }) }'), 0, "inside t()");
  eq(count('const a = { id: "courses" }'), 0, "other property");

  eq(localeLists('const a = ["en", "tr"]', ["en", "tr", "de"]).length, 1, "locale list");
  eq(localeLists('const a = ["en", "x"]', ["en", "tr", "de"]).length, 0, "one code");
  eq(localeLists('const a = ["en", "tr"] // not-site-locales', ["en", "tr", "de"]).length, 0, "marked list");

  eq(flatten({ a: { b: "x", c: ["Why not", "Zed"], d: ["students", "storage"] }, e: "w" }), { "a.b": "x", "a.c.0": "Why not", "a.c.1": "Zed", e: "w" }, "flatten");
  eq(tokens("{count} courses") === tokens("{n} kurs"), false, "argument names differ");
  eq(tokens("{count, plural, one {# course} other {# courses}}") === tokens("{count, plural, one {# kurs} other {# kurs}}"), true, "plural branches are text");
  eq(tokens("{n, plural, one {Continue} other {Continue}}") === tokens("{n, plural, one {Devam} other {Devam}}"), true, "one-word branch");
  eq(tokens("Click <b>here</b>") === tokens("Tikla"), false, "tags differ");

  const dir = mkdtempSync(join(tmpdir(), "i18n-check-"));
  try {
    const put = (path, data) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), JSON.stringify(data));
    };
    const good = () => {
      put("en/ns.json", { a: "{count} courses", b: ["students", "storage"], c: "Save" });
      put("tr/ns.json", { a: "{count} kurs", b: ["students", "storage"], c: "Kaydet" });
      put("tr.review.json", { "ns.a": { src: digest("{count} courses"), reviewed: false }, "ns.c": { src: digest("Save"), reviewed: true } });
    };
    good();
    eq(completeness(dir, ["tr"]), [], "a complete root");
    put("tr/ns.json", { a: "{n} kurs", c: "Kaydet" });
    eq(completeness(dir, ["tr"]).length, 1, "renamed argument");
    put("tr/ns.json", { a: "{count} kurs" });
    eq(completeness(dir, ["tr"]).length, 1, "missing key");
    good();
    put("tr.review.json", { "ns.a": { src: digest("old"), reviewed: false }, "ns.c": { src: digest("Save"), reviewed: true } });
    eq(completeness(dir, ["tr"]).length, 1, "stale src");
    good();
    eq(completeness(dir, ["de"]).length, 4, "a language without files: the file, the review file and both keys");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  eq(ratchet({ a: 2, b: 1 }, { a: 1, b: 1, c: 3 }), { higher: ["a: 2 hard-coded text(s), baseline 1"], lower: ["c: 0, baseline 3"] }, "ratchet");
  eq(updated({ a: 5, b: 1 }, { a: 2, b: 3, c: 1 }), { a: 2, b: 1 }, "update only lowers");
  eq(updated({ b: 1, a: 5 }, null), { a: 5, b: 1 }, "first baseline is the full counts");
  console.log("check-i18n.mjs: self-test passed");
  return 0;
}

process.exit(process.argv.includes("--self-test") ? selfTest() : main(process.argv.slice(2)));
