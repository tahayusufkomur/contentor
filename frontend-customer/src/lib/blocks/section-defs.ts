import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  CreditCard,
  Footprints,
  Images,
  Mail,
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
import { SectionBlock } from "@/components/sections/section-block";
import type { Block } from "@/types/tenant";
import type { BlockDefinition, DynamicDataKey } from "./types";
import type { FieldSchema } from "./field-schema";

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

function toField(key: string, f: FamilyField): FieldSchema {
  switch (f.type) {
    case "richtext":
      return { key, label: f.label, type: "richtext", required: f.required };
    case "link":
      return { key, label: f.label, type: "link" };
    case "image":
      return { key, label: f.label, type: "image", required: f.required };
    case "bool":
      return { key, label: f.label, type: "toggle" };
    case "select":
      return {
        key,
        label: f.label,
        type: "select",
        options: (f.options ?? []).map((o) => ({ label: o, value: o })),
      };
    case "items":
      return {
        key,
        label: f.label,
        type: "repeater",
        itemLabel: f.itemLabel,
        maxItems: f.max,
        itemFields: Object.entries(f.fields ?? {}).map(([k, sub]) =>
          toField(k, sub),
        ),
      };
    default:
      return {
        key,
        label: f.label,
        type: (f.max ?? 0) > 120 ? "textarea" : "text",
        required: f.required,
        helpText: f.max ? `Up to ${f.max} characters.` : undefined,
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

const PLACEHOLDER: Partial<Record<FamilyId, Partial<Block>>> = {
  hero: {
    headline: "A headline that says what you offer",
    subhead: "One sentence on who it's for and what changes for them.",
    ctaLabel: "Explore courses",
    ctaHref: "/courses",
  },
  story: {
    heading: "Hi, I'm glad you're here",
    body: "<p>Tell visitors how you started, who you teach and what a session with you feels like.</p>",
  },
  benefits: {
    heading: "What you'll gain",
    items: [
      { title: "First benefit", text: "What changes for your students." },
      { title: "Second benefit", text: "What changes for your students." },
      { title: "Third benefit", text: "What changes for your students." },
    ],
  },
  courseShowcase: {
    heading: "Courses",
    ctaLabel: "See all courses",
    limit: "3",
  },
  howItWorks: {
    heading: "How it works",
    steps: [
      { title: "Choose", text: "Pick the course or class that fits you." },
      { title: "Join", text: "Learn at your own pace or live with me." },
      { title: "Grow", text: "Practise, ask questions and see progress." },
    ],
  },
  philosophy: {
    statement: "A sentence you believe about your craft, in your own words.",
  },
  moments: { heading: "Moments", photos: [{}, {}, {}] },
  pricing: { heading: "Membership" },
  faq: {
    heading: "Questions, answered",
    items: [
      { q: "Who is this for?", a: "Describe who you teach." },
      { q: "Do I need experience?", a: "Say what a beginner needs." },
      { q: "How do I start?", a: "Explain the first step." },
    ],
  },
  cta: {
    heading: "Ready to begin?",
    ctaLabel: "Get started",
    ctaHref: "/courses",
  },
  contact: {
    heading: "Get in touch",
    text: "Questions about a course or a session? Send a message.",
    showForm: true,
  },
  events: { heading: "Upcoming classes", ctaLabel: "See the calendar" },
};

/** Fresh content for a new section block in `styleId` (first variant). */
export function sectionDefaultData(
  family: FamilyId,
  styleId?: string,
): Partial<Block> {
  const style =
    (styleId && SITE_STYLES[styleId]) || Object.values(SITE_STYLES)[0];
  const first = style?.variants[family]?.[0];
  return {
    ...(first ? { variant: `${style!.id}.${first}` } : {}),
    ...structuredClone(PLACEHOLDER[family] ?? {}),
  };
}

export const SECTION_BLOCK_DEFS: Record<string, BlockDefinition> =
  Object.fromEntries(
    FAMILY_IDS.map((family) => {
      const fam = FAMILIES[family];
      const type = `${SECTION_PREFIX}${family}`;
      const fields: FieldSchema[] = [
        {
          key: "variant",
          label: "Layout",
          type: "select",
          dynamicOptions: variantOptions(family),
        },
        ...Object.entries(fam.fields).map(([k, f]) => toField(k, f)),
      ];
      const def: BlockDefinition = {
        type,
        label: fam.label,
        icon: ICONS[family],
        group: "section",
        component: SectionBlock,
        defaultData: sectionDefaultData(family),
        fields,
        ...(fam.source ? { dynamicDataKey: SOURCE_KEY[fam.source] } : {}),
      };
      return [type, def];
    }),
  );

/** Wrapper class for a rendered page: styled-section pages are designed
 *  full-bleed (globals.css lifts the layout's max-width for .page-fullbleed);
 *  legacy block pages keep breaking out of the layout's padding only. */
export function pageWrapperClass(blocks: { type?: string }[]): string {
  return blocks.some((b) => isSectionType(b.type))
    ? "page-fullbleed"
    : "-mx-4 -mt-8 md:-mx-6";
}
