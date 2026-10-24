import { notFound } from "next/navigation";
import {
  FAMILIES,
  FAMILY_IDS,
  SECTION_MANIFEST,
  styleRecipe,
  type FamilyId,
  type RecipePage,
} from "@shared/sections/types";
import { SITE_STYLES, styleFontsHref, styleScope } from "@/lib/site-styles";
import { STYLE_SECTIONS } from "@/components/sections/registry";
import {
  FIXTURE_SETS,
  fixtureBlock,
  fixtureData,
  type FixtureSet,
} from "@/components/sections/fixtures";

export const dynamic = "force-dynamic";

/**
 * Dev-only design showcase: every family × variant of a style with fixture
 * content, or a whole recipe page as a coach would get it.
 *   /design-showcase?style=<id>                 all families, long content
 *   /design-showcase?style=<id>&size=short      shortest allowed content
 *   /design-showcase?style=<id>&size=real&fixture=yoga|business|family
 *                                               content as a composed site reads
 *   /design-showcase?style=<id>&family=hero     one family
 *   /design-showcase?style=<id>&page=home       a full recipe page
 *   &bare=1 hides the toolbar (for screenshots)
 *   &header=<px> puts a spacer that tall above the page (the real site header,
 *   about 64 px on a phone)
 *   &headline=<text> replaces the hero headline of the `real` size (length tests)
 */
export default async function DesignShowcasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const styleIds = Object.keys(SITE_STYLES);
  const style = SITE_STYLES[sp.style ?? ""] ?? SITE_STYLES[styleIds[0]];
  if (!style) return <p className="p-8">No styles yet.</p>;
  const size = sp.size === "short" || sp.size === "real" ? sp.size : "long";
  const set =
    FIXTURE_SETS.find((s) => s === sp.fixture) ?? ("yoga" as FixtureSet);
  const sections = STYLE_SECTIONS[style.id] ?? {};
  const header = Math.min(Number(sp.header) || 0, 200);
  // The toolbar's links keep the view they sit on (size, fixture, header, headline).
  const extra = new URLSearchParams();
  if (sp.header) extra.set("header", sp.header);
  if (sp.headline) extra.set("headline", sp.headline);
  const more = extra.toString() ? `&${extra}` : "";
  const kept = `&size=${size}&fixture=${set}${more}`;

  type Item = { family: FamilyId; variant: string };
  let items: Item[] = [];
  if (sp.page && sp.page in SECTION_MANIFEST.recipes) {
    items = styleRecipe(style, sp.page as RecipePage).map((entry) => {
      const [family, name] = entry.split(":") as [FamilyId, string | undefined];
      return { family, variant: name ?? style.variants[family]?.[0] ?? "" };
    });
  } else {
    const families = sp.family ? ([sp.family] as FamilyId[]) : FAMILY_IDS;
    for (const family of families) {
      for (const name of style.variants[family] ?? [])
        items.push({ family, variant: name });
    }
  }

  return (
    <div style={styleScope(style, sp.palette)} className="min-h-screen">
      <link rel="stylesheet" href={styleFontsHref(style)} />
      {!sp.bare && (
        <nav className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-black/10 bg-white/90 px-4 py-2 font-mono text-[11px] text-black backdrop-blur">
          <strong className="mr-2">{style.label}</strong>
          {styleIds.map((id) => (
            <a
              key={id}
              href={`?style=${id}${kept}`}
              className={id === style.id ? "underline" : "opacity-60"}
            >
              {id}
            </a>
          ))}
          <span className="mx-2 opacity-30">|</span>
          {[{ id: "", label: style.paletteLabel }, ...style.palettes].map(
            (p) => (
              <a
                key={p.id || "own"}
                href={`?style=${style.id}&palette=${p.id}${sp.page ? `&page=${sp.page}` : ""}${kept}`}
                className={
                  (sp.palette ?? "") === p.id ? "underline" : "opacity-60"
                }
              >
                {p.label}
              </a>
            ),
          )}
          <span className="mx-2 opacity-30">|</span>
          {Object.keys(SECTION_MANIFEST.recipes).map((p) => (
            <a
              key={p}
              href={`?style=${style.id}&page=${p}${kept}`}
              className={sp.page === p ? "underline" : "opacity-60"}
            >
              {p}
            </a>
          ))}
          <span className="mx-2 opacity-30">|</span>
          <a href={`?style=${style.id}&size=long`} className="opacity-60">
            long
          </a>
          <a href={`?style=${style.id}&size=short`} className="opacity-60">
            short
          </a>
          {FIXTURE_SETS.map((f) => (
            <a
              key={f}
              href={`?style=${style.id}&size=real&fixture=${f}${more}`}
              className={
                size === "real" && set === f ? "underline" : "opacity-60"
              }
            >
              real:{f}
            </a>
          ))}
        </nav>
      )}
      {header > 0 && (
        <div
          aria-hidden
          data-showcase-header
          style={{ height: header }}
          className="bg-black/10"
        />
      )}
      {items.map(({ family, variant }, i) => {
        const Comp = sections[family]?.[variant];
        const key = `${family}-${variant}-${i}`;
        if (!Comp) {
          return (
            <div
              key={key}
              className="border-y border-dashed border-red-400 p-6 font-mono text-xs text-red-600"
            >
              missing: {style.id} / {family} / {variant}
            </div>
          );
        }
        const block = fixtureBlock(family, `${style.id}.${variant}`, size, set);
        if (family === "hero" && size === "real" && sp.headline)
          block.headline = sp.headline;
        return (
          <div key={key} data-showcase={`${family}.${variant}`}>
            {!sp.bare && !sp.page && (
              <div className="bg-black px-4 py-1 font-mono text-[10px] uppercase tracking-widest text-white/70">
                {FAMILIES[family].label} · {variant}
              </div>
            )}
            <Comp block={block} data={fixtureData(family, size, set)} />
          </div>
        );
      })}
    </div>
  );
}
