import {
  Megaphone,
  AlignLeft,
  Columns2,
  Images,
  Quote,
  HelpCircle,
  MousePointerClick,
  BarChart3,
  Building2,
  Video as VideoIcon,
  Flag,
  Mail,
  BookOpen,
  CreditCard,
  CalendarDays,
  ShoppingBag,
} from "lucide-react";
import type { Block } from "@/types/tenant";
import type { BlockDefinition, BlockGroup, DynamicDataKey } from "./types";
import type { FieldSchema } from "./field-schema";

import { HeroBlock } from "@/components/blocks/hero-block";
import { RichTextBlock } from "@/components/blocks/rich-text-block";
import { ImageTextBlock } from "@/components/blocks/image-text-block";
import { GalleryBlock } from "@/components/blocks/gallery-block";
import { TestimonialsBlock } from "@/components/blocks/testimonials-block";
import { FaqBlock } from "@/components/blocks/faq-block";
import { CtaBlock } from "@/components/blocks/cta-block";
import { StatsBlock } from "@/components/blocks/stats-block";
import { LogosBlock } from "@/components/blocks/logos-block";
import { VideoBlock } from "@/components/blocks/video-block";
import { BannerBlock } from "@/components/blocks/banner-block";
import { ContactBlock } from "@/components/blocks/contact-block";
import { CourseGridBlock } from "@/components/blocks/course-grid-block";
import { PricingPlansBlock } from "@/components/blocks/pricing-plans-block";
import { UpcomingEventsBlock } from "@/components/blocks/upcoming-events-block";
import { StoreProductsBlock } from "@/components/blocks/store-products-block";

const EMPTY_IMAGE = { url: null, photo_id: null };
const EMPTY_VIDEO = { url: null, video_id: null };

/** A "Layout" select field. Each entry is `[value, label]`; the first value is
 *  the block's default layout (kept in `defaultData.layout`). Every block has
 *  one so a coach can switch structural arrangement without losing content. */
function layoutField(options: [string, string][]): FieldSchema {
  return {
    key: "layout",
    label: "Layout",
    type: "select",
    display: "icons",
    options: options.map(([value, label]) => ({ label, value })),
  };
}

export const BLOCK_REGISTRY: Record<string, BlockDefinition> = {
  hero: {
    type: "hero",
    label: "Hero",
    icon: Megaphone,
    group: "content",
    component: HeroBlock,
    defaultData: {
      layout: "centered",
      heading: "Welcome",
      subheading: "A short, compelling tagline.",
      ctaText: "Get started",
      ctaHref: "/courses",
      bgImage: { ...EMPTY_IMAGE },
    },
    fields: [
      layoutField([
        ["centered", "Centered (full-bleed image)"],
        ["split", "Split (text + image)"],
        ["minimal", "Minimal (no image)"],
      ]),
      { key: "heading", label: "Headline", type: "text", required: true },
      { key: "subheading", label: "Subheadline", type: "text" },
      { key: "ctaText", label: "Button text", type: "text" },
      { key: "ctaHref", label: "Button link", type: "link" },
      {
        key: "bgImage",
        label: "Image",
        type: "image",
        helpText: "Used as the background (Centered) or side image (Split).",
      },
    ],
  },
  richText: {
    type: "richText",
    label: "Text",
    icon: AlignLeft,
    group: "content",
    component: RichTextBlock,
    defaultData: {
      layout: "standard",
      heading: "Heading",
      headingLevel: "h2",
      body: "",
    },
    fields: [
      layoutField([
        ["standard", "Standard"],
        ["centered", "Centered"],
        ["wide", "Wide"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      {
        key: "headingLevel",
        label: "Heading level",
        type: "select",
        options: [
          { label: "H1 (largest)", value: "h1" },
          { label: "H2 (large)", value: "h2" },
          { label: "H3 (medium)", value: "h3" },
          { label: "H4 (small)", value: "h4" },
        ],
      },
      { key: "body", label: "Body", type: "richtext" },
    ],
  },
  imageText: {
    type: "imageText",
    label: "Image + Text",
    icon: Columns2,
    group: "content",
    component: ImageTextBlock,
    defaultData: {
      layout: "split",
      heading: "Heading",
      headingLevel: "h2",
      body: "",
      image: { ...EMPTY_IMAGE },
      imagePosition: "right",
    },
    fields: [
      layoutField([
        ["split", "Side by side"],
        ["stacked", "Stacked"],
        ["card", "Card"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      {
        key: "headingLevel",
        label: "Heading level",
        type: "select",
        options: [
          { label: "H1 (largest)", value: "h1" },
          { label: "H2 (large)", value: "h2" },
          { label: "H3 (medium)", value: "h3" },
          { label: "H4 (small)", value: "h4" },
        ],
      },
      { key: "body", label: "Body", type: "richtext" },
      { key: "image", label: "Image", type: "image" },
      {
        key: "imagePosition",
        label: "Image position (Side by side)",
        type: "select",
        options: [
          { label: "Right", value: "right" },
          { label: "Left", value: "left" },
        ],
      },
    ],
  },
  gallery: {
    type: "gallery",
    label: "Gallery",
    icon: Images,
    group: "content",
    component: GalleryBlock,
    defaultData: { layout: "grid", heading: "Gallery", items: [] },
    fields: [
      layoutField([
        ["grid", "Grid"],
        ["masonry", "Masonry"],
        ["carousel", "Carousel"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Images",
        type: "repeater",
        itemLabel: "Image",
        itemFields: [
          { key: "image", label: "Image", type: "image", required: true },
          { key: "caption", label: "Caption", type: "text" },
        ],
      },
    ],
  },
  testimonials: {
    type: "testimonials",
    label: "Testimonials",
    icon: Quote,
    group: "content",
    component: TestimonialsBlock,
    defaultData: { layout: "cards", heading: "What students say", items: [] },
    fields: [
      layoutField([
        ["cards", "Cards"],
        ["quote", "Large quote"],
        ["list", "List"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Testimonials",
        type: "repeater",
        itemLabel: "Testimonial",
        itemFields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "text", label: "Quote", type: "textarea", required: true },
          { key: "avatar", label: "Avatar", type: "image" },
        ],
      },
    ],
  },
  faq: {
    type: "faq",
    label: "FAQ",
    icon: HelpCircle,
    group: "content",
    component: FaqBlock,
    defaultData: {
      layout: "accordion",
      heading: "Frequently asked questions",
      items: [],
    },
    fields: [
      layoutField([
        ["accordion", "Accordion"],
        ["open", "Open list"],
        ["columns", "Two columns"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Questions",
        type: "repeater",
        itemLabel: "Question",
        itemFields: [
          { key: "q", label: "Question", type: "text", required: true },
          { key: "a", label: "Answer", type: "textarea", required: true },
        ],
      },
    ],
  },
  cta: {
    type: "cta",
    label: "Call to action",
    icon: MousePointerClick,
    group: "content",
    component: CtaBlock,
    defaultData: {
      layout: "centered",
      heading: "Ready to start?",
      buttonText: "Join now",
      buttonHref: "/courses",
    },
    fields: [
      layoutField([
        ["centered", "Centered"],
        ["banner", "Banner"],
        ["split", "Split"],
      ]),
      { key: "heading", label: "Heading", type: "text", required: true },
      { key: "buttonText", label: "Button text", type: "text" },
      { key: "buttonHref", label: "Button link", type: "link" },
    ],
  },
  stats: {
    type: "stats",
    label: "Stats",
    icon: BarChart3,
    group: "content",
    component: StatsBlock,
    defaultData: { layout: "cards", heading: "", items: [] },
    fields: [
      layoutField([
        ["cards", "Cards"],
        ["plain", "Plain"],
        ["band", "Band"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Stats",
        type: "repeater",
        itemLabel: "Stat",
        itemFields: [
          { key: "value", label: "Value", type: "text", required: true },
          { key: "label", label: "Label", type: "text", required: true },
        ],
      },
    ],
  },
  logos: {
    type: "logos",
    label: "Logo strip",
    icon: Building2,
    group: "content",
    component: LogosBlock,
    defaultData: { layout: "row", heading: "As featured in", items: [] },
    fields: [
      layoutField([
        ["row", "Row"],
        ["grid", "Grid"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      {
        key: "items",
        label: "Logos",
        type: "repeater",
        itemLabel: "Logo",
        itemFields: [
          { key: "image", label: "Logo", type: "image", required: true },
          { key: "alt", label: "Alt text", type: "text" },
        ],
      },
    ],
  },
  video: {
    type: "video",
    label: "Video",
    icon: VideoIcon,
    group: "content",
    component: VideoBlock,
    defaultData: { layout: "standard", heading: "", video: { ...EMPTY_VIDEO } },
    fields: [
      layoutField([
        ["standard", "Standard"],
        ["wide", "Wide"],
        ["full", "Full width"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      {
        key: "video",
        label: "Video",
        type: "video",
        helpText: "Paste a YouTube/Vimeo link or pick a library video.",
      },
    ],
  },
  banner: {
    type: "banner",
    label: "Banner",
    icon: Flag,
    group: "content",
    component: BannerBlock,
    defaultData: {
      layout: "bar",
      text: "Announcement",
      linkText: "",
      linkHref: "",
    },
    fields: [
      layoutField([
        ["bar", "Bar"],
        ["full", "Full width"],
        ["soft", "Soft"],
      ]),
      { key: "text", label: "Text", type: "text", required: true },
      { key: "linkText", label: "Link text", type: "text" },
      { key: "linkHref", label: "Link", type: "link" },
    ],
  },
  contact: {
    type: "contact",
    label: "Contact form",
    icon: Mail,
    group: "content",
    component: ContactBlock,
    defaultData: {
      layout: "centered",
      heading: "Get in touch",
      intro: "Have a question? Send us a message.",
      submitLabel: "Send message",
      successMessage: "Thanks! We'll get back to you soon.",
    },
    fields: [
      layoutField([
        ["centered", "Centered"],
        ["split", "Split"],
        ["card", "Card"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      { key: "intro", label: "Intro text", type: "textarea" },
      { key: "submitLabel", label: "Submit button label", type: "text" },
      { key: "successMessage", label: "Success message", type: "text" },
    ],
  },

  // --- Dynamic blocks ---
  courseGrid: {
    type: "courseGrid",
    label: "Courses",
    icon: BookOpen,
    group: "dynamic",
    component: CourseGridBlock,
    dynamicDataKey: "courses",
    defaultData: {
      layout: "standard",
      heading: "Courses",
      limit: 0,
      columns: "3",
      cardStyle: "elevated",
      showFilters: true,
      showPrice: true,
      showMeta: true,
    },
    fields: [
      layoutField([
        ["standard", "Left heading"],
        ["centered", "Centered heading"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      { key: "limit", label: "Max courses (0 = all)", type: "number" },
      {
        key: "columns",
        label: "Columns",
        type: "select",
        options: [
          { label: "2 columns", value: "2" },
          { label: "3 columns", value: "3" },
          { label: "4 columns", value: "4" },
        ],
      },
      {
        key: "cardStyle",
        label: "Card style",
        type: "select",
        options: [
          { label: "Elevated", value: "elevated" },
          { label: "Bordered", value: "bordered" },
          { label: "Minimal", value: "minimal" },
          { label: "Overlay", value: "overlay" },
        ],
      },
      { key: "showFilters", label: "Show search & filters", type: "toggle" },
      { key: "showPrice", label: "Show price", type: "toggle" },
      { key: "showMeta", label: "Show instructor & lessons", type: "toggle" },
    ],
  },
  pricingPlans: {
    type: "pricingPlans",
    label: "Pricing plans",
    icon: CreditCard,
    group: "dynamic",
    component: PricingPlansBlock,
    dynamicDataKey: "plans",
    defaultData: {
      layout: "cards",
      heading: "Plans & Pricing",
      subheading: "",
    },
    fields: [
      layoutField([
        ["cards", "Cards"],
        ["compact", "Compact"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Subheading", type: "text" },
    ],
  },
  upcomingEvents: {
    type: "upcomingEvents",
    label: "Upcoming events",
    icon: CalendarDays,
    group: "dynamic",
    component: UpcomingEventsBlock,
    dynamicDataKey: "events",
    defaultData: { layout: "grid", heading: "Upcoming events", limit: 6 },
    fields: [
      layoutField([
        ["grid", "Grid"],
        ["list", "List"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      { key: "limit", label: "Max events", type: "number" },
    ],
  },
  storeProducts: {
    type: "storeProducts",
    label: "Store products",
    icon: ShoppingBag,
    group: "dynamic",
    component: StoreProductsBlock,
    dynamicDataKey: "storeProducts",
    defaultData: { layout: "grid", heading: "Shop", limit: 8 },
    fields: [
      layoutField([
        ["grid", "Grid"],
        ["list", "List"],
      ]),
      { key: "heading", label: "Heading", type: "text" },
      { key: "limit", label: "Max products", type: "number" },
    ],
  },
};

export function getBlockDef(type: string): BlockDefinition | undefined {
  return BLOCK_REGISTRY[type];
}

export const BLOCKS_BY_GROUP: Record<BlockGroup, BlockDefinition[]> = {
  content: Object.values(BLOCK_REGISTRY).filter((b) => b.group === "content"),
  dynamic: Object.values(BLOCK_REGISTRY).filter((b) => b.group === "dynamic"),
};

/** Dynamic datasets referenced by the enabled blocks on a page. */
export function dynamicKeysForBlocks(blocks: Block[]): Set<DynamicDataKey> {
  const keys = new Set<DynamicDataKey>();
  for (const block of blocks) {
    if (block.enabled === false) continue;
    const def = BLOCK_REGISTRY[block.type];
    if (def?.dynamicDataKey) keys.add(def.dynamicDataKey);
  }
  return keys;
}

/** A fresh, unique block id (`blk_xxxxxxxx`). Used for new blocks, duplicated
 *  blocks, and re-minting ids when a page template is applied. */
export function mintBlockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `blk_${crypto.randomUUID().slice(0, 8)}`
    : `blk_${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a fresh block of the given type with a unique id + default content. */
export function newBlock(type: string): Block {
  const def = BLOCK_REGISTRY[type];
  return {
    id: mintBlockId(),
    type,
    enabled: true,
    ...structuredClone(def?.defaultData ?? {}),
  };
}
