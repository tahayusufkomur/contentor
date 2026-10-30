import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  Clapperboard,
  CreditCard,
  Footprints,
  Images,
  Mail,
  Megaphone,
  MessageSquareQuote,
  MousePointerClick,
  Quote,
  Sparkles,
  Star,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  FAMILIES,
  FAMILY_IDS,
  type FamilyField,
  type FamilyId,
} from "@shared/sections/types";
import { SITE_STYLES } from "@shared/sections/styles";
import { CX_BLOCK_TYPE } from "@shared/cx/types";
import { SectionBlock } from "@/components/sections/section-block";
import type { Block } from "@/types/tenant";
import type { BlockDefinition, DynamicDataKey } from "./types";
import type { FieldSchema } from "./field-schema";
import { ENGLISH_CONTENT, NO_WORDS, escapeHtml, slug, type Say } from "./say";

const ICONS: Record<FamilyId, LucideIcon> = {
  hero: Sparkles,
  story: UserRound,
  benefits: Star,
  courseShowcase: BookOpen,
  howItWorks: Footprints,
  philosophy: Quote,
  moments: Images,
  pricing: CreditCard,
  faq: CircleHelp,
  cta: MousePointerClick,
  contact: Mail,
  events: CalendarDays,
  proof: MessageSquareQuote,
  statement: Megaphone,
  video: Clapperboard,
};

const SOURCE_KEY: Record<string, DynamicDataKey> = {
  courses: "courses",
  plans: "plans",
  events: "events",
};

export const SECTION_PREFIX = "section.";
export const isSectionType = (type?: string) =>
  Boolean(type?.startsWith(SECTION_PREFIX));
export const sectionFamily = (type: string) =>
  type.slice(SECTION_PREFIX.length) as FamilyId;

function humanize(name: string) {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** `ui(key)` when the creator's language has a message there, else `english`
 *  (the manifest's own text, which the family manifest keeps in English). */
const words = (ui: Say, key: string, english: string) =>
  ui.has(key) ? ui(key) : english;

/** A manifest field as an editor field, named in the creator's language.
 *  `family` is the section family the field belongs to (its help is keyed by it). */
export function toField(
  key: string,
  f: FamilyField,
  ui: Say,
  family?: FamilyId,
): FieldSchema {
  const label = words(ui, `manifest.${slug(f.label)}`, f.label);
  const help =
    f.help && family
      ? words(ui, `sectionHelp.${family}.${key}`, f.help)
      : f.help;
  switch (f.type) {
    case "richtext":
      return { key, label, type: "richtext", required: f.required };
    case "link":
      return { key, label, type: "link" };
    case "image":
      return { key, label, type: "image", required: f.required };
    case "video":
      return {
        key,
        label,
        type: "video",
        required: f.required,
        helpText: help,
      };
    case "bool":
      return { key, label, type: "toggle" };
    case "select":
      return {
        key,
        label,
        type: "select",
        options: (f.options ?? []).map((o) => ({
          label: words(ui, `option.${o}`, o),
          value: o,
        })),
      };
    case "items":
      return {
        key,
        label,
        type: "repeater",
        helpText: help,
        itemLabel:
          f.itemLabel && words(ui, `item.${slug(f.itemLabel)}`, f.itemLabel),
        itemKind: f.itemLabel && slug(f.itemLabel),
        maxItems: f.max,
        itemFields: Object.entries(f.fields ?? {}).map(([k, sub]) =>
          toField(k, sub, ui, family),
        ),
      };
    default:
      return {
        key,
        label,
        type: (f.max ?? 0) > 120 ? "textarea" : "text",
        required: f.required,
        helpText: f.max ? ui("upTo", { max: f.max }) : undefined,
      };
  }
}

/** Layout options for a section: the variants of the block's own style. */
function variantOptions(family: FamilyId) {
  return (data: Record<string, unknown>) => {
    const styleId = String(data.variant ?? "").split(".")[0];
    const style = SITE_STYLES[styleId] ?? Object.values(SITE_STYLES)[0];
    if (!style) return [];
    return (style.variants[family] ?? []).map((name) => ({
      label: humanize(name),
      value: `${style.id}.${name}`,
    }));
  };
}

/** What a new section holds besides its words: links, counts, empty slots. The
 *  words themselves are `blocks.section.<family>`, in the site's language. */
const SHAPE: Partial<Record<FamilyId, Partial<Block>>> = {
  hero: { ctaHref: "/courses" },
  courseShowcase: { limit: "3" },
  moments: { photos: [{}, {}, {}] },
  cta: { ctaHref: "/courses" },
  contact: { showForm: true },
  video: { shape: "vertical" },
};

/** Fresh content for a new section block in `styleId` (first variant), written
 *  in the language of `site` (the site's, once: after that it is hers). */
export function sectionDefaultData(
  family: FamilyId,
  styleId?: string,
  site: Say = ENGLISH_CONTENT,
): Partial<Block> {
  const style =
    (styleId && SITE_STYLES[styleId]) || Object.values(SITE_STYLES)[0];
  const first = style?.variants[family]?.[0];
  const key = `section.${family}`;
  const text = site.has(key)
    ? (structuredClone(site.raw(key)) as Record<string, unknown>)
    : {};
  // The story's body is rich text: HTML around the plain message.
  if (typeof text.body === "string")
    text.body = `<p>${escapeHtml(text.body)}</p>`;
  return {
    ...(first ? { variant: `${style!.id}.${first}` } : {}),
    ...text,
    ...structuredClone(SHAPE[family] ?? {}),
  };
}

/** One block definition per section family, named in the creator's language
 *  (`ui`), seeded in the site's (`site`). */
export function buildSectionDefs(
  ui: Say,
  site: Say,
): Record<string, BlockDefinition> {
  return Object.fromEntries(
    FAMILY_IDS.map((family) => {
      const fam = FAMILIES[family];
      const type = `${SECTION_PREFIX}${family}`;
      const fields: FieldSchema[] = [
        {
          key: "variant",
          label: ui("layout.label"),
          type: "select",
          dynamicOptions: variantOptions(family),
        },
        ...Object.entries(fam.fields).map(([k, f]) =>
          toField(k, f, ui, family),
        ),
      ];
      const def: BlockDefinition = {
        type,
        label: words(ui, `family.${family}`, fam.label),
        icon: ICONS[family],
        group: "section",
        component: SectionBlock,
        defaultData: sectionDefaultData(family, undefined, site),
        fields,
        ...(fam.source ? { dynamicDataKey: SOURCE_KEY[fam.source] } : {}),
      };
      return [type, def];
    }),
  );
}

/** The families in the manifest's own (English) words: for code that needs the
 *  structure of a section and never shows its name. */
export const SECTION_BLOCK_DEFS = buildSectionDefs(NO_WORDS, ENGLISH_CONTENT);

/** Wrapper class for a rendered page: styled-section and AI-section pages are designed
 *  full-bleed (globals.css lifts the layout's max-width for .page-fullbleed);
 *  legacy block pages keep breaking out of the layout's padding only. */
export function pageWrapperClass(blocks: { type?: string }[]): string {
  return blocks.some((b) => isSectionType(b.type) || b.type === CX_BLOCK_TYPE)
    ? "page-fullbleed"
    : "-mx-4 -mt-8 md:-mx-6";
}
