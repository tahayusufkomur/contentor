#!/usr/bin/env node
// Writes frontend-main/public/media/media.json from the files encode.sh wrote
// and scripts/footage/stills.json, after checking what the landing would trip
// on. Run from the repo root:
//   node scripts/footage/manifest.mjs [--partial]
// --partial leaves out keys whose main file is not encoded yet (so stills can
// ship before the footage); the final run has no flag and needs every key.
// MEDIA_DIR points it at a copy of public/media (Task 9's negative check).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const PUBLIC = "frontend-main/public";
const DIR = process.env.MEDIA_DIR ?? path.join(PUBLIC, "media");
const partial = process.argv.includes("--partial");
const META = JSON.parse(readFileSync("scripts/footage/stills.json", "utf8"));

const NICHES = ["yoga", "fitness", "music", "dance", "cooking", "language", "martial-arts", "crafts", "beauty", "family", "outdoors", "wellness"];
const LOOKS = ["journal", "kinetic", "encore", "studiofloor", "tavola", "primer", "dojo", "workshop", "atelier", "sprout", "trail", "nocturne"];
// The landing's clip (encode.sh landing), on Mara's school.
const CLIPS = ["path-launch"];
// "One platform on every screen": the creator (a still), then a student on
// each device watching her live (loops, encode.sh screens).
const SCREENS = ["creator", "laptop", "tablet", "phone"];
const LOOPS = ["screens-laptop", "screens-tablet", "screens-phone"];
// Every key the landing reads (frontend-main/src/lib/landing.ts LANDING_MEDIA).
const KEYS = [
  ...CLIPS,
  ...SCREENS.map((d) => `screens-${d}`),
  ...NICHES.map((n) => `still-${n}`),
  ...LOOKS.map((l) => `look-${l}`),
];

const K = 1000;
const M = 1000 * K;
/** Per-file targets, in bytes. */
function targets(key) {
  if (CLIPS.includes(key)) return { src: 1.5 * M, webm: 1.5 * M, phoneSrc: 0.5 * M, poster: 120 * K };
  if (LOOPS.includes(key)) return { src: 0.7 * M, webm: 0.7 * M, phoneSrc: 0.35 * M, poster: 120 * K };
  if (key.startsWith("screens-")) return { src: 200 * K, srcSmall: 70 * K };
  if (key.startsWith("still-")) return { src: 160 * K, srcSmall: 60 * K };
  return { src: 120 * K, srcSmall: 50 * K }; // look-*
}
const kindOf = (key) => (CLIPS.includes(key) || LOOPS.includes(key) ? "clip" : "still");

const ffprobe = (file, entries) =>
  JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "json", file], {
      encoding: "utf8",
      maxBuffer: 64 * M,
    }),
  );
const dims = (file) => {
  const s = ffprobe(file, "stream=width,height").streams[0];
  return { width: s.width, height: s.height };
};
const seconds = (file) => Math.round(Number(ffprobe(file, "format=duration").format.duration) * 10) / 10;
const url = (file) => "/" + path.relative(PUBLIC, file).split(path.sep).join("/");

const errors = [];
const rows = [];
const items = {};
for (const key of KEYS) {
  const kind = kindOf(key);
  const f =
    kind === "still"
      ? { src: `${DIR}/stills/${key}.avif`, srcSmall: `${DIR}/stills/${key}-small.avif` }
      : {
          src: `${DIR}/clips/${key}.mp4`,
          webm: `${DIR}/clips/${key}.webm`,
          phoneSrc: `${DIR}/clips/${key}-phone.mp4`,
          poster: `${DIR}/posters/${key}.avif`,
        };
  if (!existsSync(f.src)) {
    if (!partial) errors.push(`${key}: ${f.src} is missing (scripts/footage/encode.sh)`);
    continue;
  }
  for (const [field, file] of Object.entries(f)) if (!existsSync(file)) delete f[field];

  const item = { kind, src: url(f.src), ...dims(f.src), bytes: statSync(f.src).size };
  if (kind === "still") {
    const meta = META[key] ?? {};
    if (!meta.alt) errors.push(`${key}: no alt in scripts/footage/stills.json`);
    else item.alt = meta.alt;
    if (key.startsWith("still-") && !meta.license) errors.push(`${key}: no license in scripts/footage/stills.json`);
    if (meta.license) item.license = meta.license;
    if (f.srcSmall) {
      item.srcSmall = url(f.srcSmall);
      // Phases 2–3 build srcSet as `${srcSmall} ${width / 2}w`: the twin must be exactly half.
      const s = dims(f.srcSmall);
      if (s.width * 2 !== item.width) errors.push(`${key}: small twin ${s.width} px ≠ half of ${item.width}`);
    } else errors.push(`${key}: no small twin`);
  } else {
    if (!f.poster) errors.push(`${key}: no poster`);
    else {
      item.poster = url(f.poster);
      // Review Focus 5: a poster of another size shifts the layout when the video takes over.
      const p = dims(f.poster);
      if (p.width !== item.width || p.height !== item.height)
        errors.push(`${key}: poster ${p.width}×${p.height} ≠ clip ${item.width}×${item.height}`);
    }
    if (f.webm) {
      item.webm = url(f.webm);
      // Desktop Chrome plays the webm (MediaVideo lists it first) while Phase 2 sums the mp4.
      if (statSync(f.webm).size > item.bytes) errors.push(`${key}: webm bigger than the mp4: raise its VP9 -crf in encode.sh`);
    }
    if (f.phoneSrc) item.phoneSrc = url(f.phoneSrc);
    if (META[key]?.alt) item.alt = META[key].alt; // a loop that carries meaning (screens-*)
    item.durationS = seconds(f.src);
  }
  for (const [field, max] of Object.entries(targets(key))) {
    if (!f[field]) continue;
    const bytes = statSync(f[field]).size;
    rows.push(`${bytes > max ? "OVER" : "ok  "}  ${key}.${field}  ${Math.round(bytes / K)} KB / ${Math.round(max / K)} KB`);
    if (bytes > max) errors.push(`${key}.${field}: ${Math.round(bytes / K)} KB, over the ${Math.round(max / K)} KB target`);
  }
  items[key] = item;
}
console.log(rows.join("\n"));
if (errors.length) {
  console.error(`\n${errors.length} problem(s), media.json not written:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
writeFileSync(path.join(DIR, "media.json"), JSON.stringify({ items }, null, 2) + "\n");
console.log(`\nwrote ${Object.keys(items).length} of ${KEYS.length} keys to ${path.join(DIR, "media.json")}`);
