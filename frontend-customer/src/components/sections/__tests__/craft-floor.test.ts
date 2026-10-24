import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The craft floor (spec R11) as a guard over every style folder: the things a
// detector run would catch again, caught before they ship.
const sectionsDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const files = readdirSync(sectionsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "__tests__")
  .flatMap((d) =>
    readdirSync(join(sectionsDir, d.name))
      .filter((f) => /\.(tsx|css)$/.test(f))
      .map((f) => ({
        name: `${d.name}/${f}`,
        path: join(sectionsDir, d.name, f),
      })),
  )
  .map((f) => ({ ...f, text: readFileSync(f.path, "utf8") }));

/** Every file that matches `re`, as "style/file: match" lines. */
const hits = (re: RegExp) =>
  files.flatMap((f) =>
    [...f.text.matchAll(re)].map((m) => `${f.name}: ${m[0]}`),
  );

describe("craft floor", () => {
  it("reads the style folders", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no style keeps its own money formatter (formatMoney from @/lib/format)", () => {
    expect(hits(/function money\(/g)).toEqual([]);
  });

  it("no style prints a raw price or currency (formatMoney does)", () => {
    expect(hits(/(?<!=)\{[\w.?]*\.(?:price|currency)\}/g)).toEqual([]);
  });

  it("no bounce or overshoot easing in the styles", () => {
    // cubic-bezier(x1, y1, x2, y2): a y outside 0..1 overshoots.
    const overshoot = hits(/cubic-bezier\(([^)]*)\)/g).filter((h) => {
      const [, y1, , y2] = h
        .slice(h.indexOf("(") + 1, -1)
        .split(",")
        .map(Number);
      return [y1, y2].some((y) => y > 1 || y < 0);
    });
    expect(overshoot).toEqual([]);
  });

  it("no Tailwind max-* variants (the preset's raw `stage` screen makes Tailwind skip every one)", () => {
    // packages/shared/tailwind-preset.ts defines a raw-query screen, and Tailwind
    // then drops all max-sm / max-md / max-lg / max-[..] rules. Write mobile-first
    // with min-width variants (sm:, md:, lg:) instead.
    expect(hits(/(?<![\w-])max-(?:sm|md|lg|xl|2xl|\[)[^\s"'`]*/g)).toEqual([]);
  });

  it("no section file grades a photo: globals.css's one photoTreatment rule does", () => {
    // Filter utilities, filter functions and blend modes on a photo would fight
    // the global rule (O2: the treatment covers every section photo). Kept on
    // purpose, each an exact match with its exact count: the band blends that
    // tint a photo into its colour band (grid luminosity, kinetic multiply,
    // encore's halftone dot screen) and the darkroom hero's lights-up reveal, a
    // keyframe that ends at `filter: none`. A second use of any of them fails.
    const grade = new RegExp(
      [
        // grayscale / sepia: bare, or arbitrary (`grayscale-[.5]`, `[&_img]:sepia-[.3]`)
        String.raw`(?<![\w-])(?:grayscale|sepia)(?![\w-])`,
        String.raw`(?<![\w-])(?:grayscale|sepia)-\[[^\]]*\]`,
        // bare `invert` / `md:invert`; the others always carry a value
        String.raw`(?<![\w-])invert(?![\w-])`,
        String.raw`(?<![\w-])(?:saturate|hue-rotate|brightness|contrast|invert)-[\w.[\]%]+`,
        // CSS filter functions
        String.raw`\b(?:grayscale|sepia|saturate|hue-rotate|brightness|contrast|invert)\([^)]*\)`,
        // blend modes (mix-blend-*, bg-blend-*, and their CSS properties)
        String.raw`(?:mix|background)-blend-mode:\s*[\w-]+`,
        String.raw`(?:mix|bg)-blend-[\w-]+`,
      ].join("|"),
      "g",
    );
    const kept = {
      "grid/grid.css: mix-blend-mode: luminosity": 1,
      "kinetic/hero.tsx: mix-blend-multiply": 1,
      "kinetic/cta.tsx: mix-blend-multiply": 1,
      "encore/encore.css: mix-blend-mode: multiply": 1,
      "darkroom/darkroom.css: brightness(1.6)": 1,
      "darkroom/darkroom.css: contrast(0.8)": 1,
    };
    const found: Record<string, number> = {};
    for (const h of hits(grade)) found[h] = (found[h] ?? 0) + 1;
    expect(found).toEqual(kept);
  });

  it("no label or text set below 0.75rem (12px)", () => {
    const rem = hits(/(?:text-\[|font-size:\s*)0?\.\d+rem/g).filter(
      (h) => parseFloat(h.replace(/.*?(\d*\.\d+)rem$/, "$1")) < 0.75,
    );
    const px = hits(/(?:text-\[|font-size:\s*)\d+(?:\.\d+)?px/g).filter(
      (h) => parseFloat(h.replace(/.*?(\d+(?:\.\d+)?)px$/, "$1")) < 12,
    );
    expect([...rem, ...px]).toEqual([]);
  });
});
