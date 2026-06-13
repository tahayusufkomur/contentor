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

export const BLOCK_REGISTRY: Record<string, BlockDefinition> = {
  hero: {
    type: "hero",
    label: "Hero",
    icon: Megaphone,
    group: "content",
    component: HeroBlock,
    defaultData: {
      heading: "Welcome",
      subheading: "A short, compelling tagline.",
      ctaText: "Get started",
      ctaHref: "/courses",
      bgImage: { ...EMPTY_IMAGE },
    },
    fields: [
      { key: "heading", label: "Headline", type: "text", required: true },
      { key: "subheading", label: "Subheadline", type: "text" },
      { key: "ctaText", label: "Button text", type: "text" },
      { key: "ctaHref", label: "Button link", type: "link" },
      { key: "bgImage", label: "Background image", type: "image" },
    ],
  },
  richText: {
    type: "richText",
    label: "Text",
    icon: AlignLeft,
    group: "content",
    component: RichTextBlock,
    defaultData: { heading: "Heading", body: "" },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body", type: "textarea" },
    ],
  },
  imageText: {
    type: "imageText",
    label: "Image + Text",
    icon: Columns2,
    group: "content",
    component: ImageTextBlock,
    defaultData: { heading: "Heading", body: "", image: { ...EMPTY_IMAGE }, imagePosition: "right" },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body", type: "textarea" },
      { key: "image", label: "Image", type: "image" },
      {
        key: "imagePosition",
        label: "Image position",
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
    defaultData: { heading: "Gallery", items: [] },
    fields: [
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
    defaultData: { heading: "What students say", items: [] },
    fields: [
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
    defaultData: { heading: "Frequently asked questions", items: [] },
    fields: [
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
    defaultData: { heading: "Ready to start?", buttonText: "Join now", buttonHref: "/courses" },
    fields: [
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
    defaultData: { heading: "", items: [] },
    fields: [
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
    defaultData: { heading: "As featured in", items: [] },
    fields: [
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
    defaultData: { heading: "", video: { ...EMPTY_VIDEO } },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "video", label: "Video", type: "video", helpText: "Paste a YouTube/Vimeo link or pick a library video." },
    ],
  },
  banner: {
    type: "banner",
    label: "Banner",
    icon: Flag,
    group: "content",
    component: BannerBlock,
    defaultData: { text: "Announcement", linkText: "", linkHref: "" },
    fields: [
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
      heading: "Get in touch",
      intro: "Have a question? Send us a message.",
      submitLabel: "Send message",
      successMessage: "Thanks! We'll get back to you soon.",
    },
    fields: [
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
    defaultData: { heading: "Courses", limit: 0 },
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "limit", label: "Max courses (0 = all)", type: "number" },
    ],
  },
  pricingPlans: {
    type: "pricingPlans",
    label: "Pricing plans",
    icon: CreditCard,
    group: "dynamic",
    component: PricingPlansBlock,
    dynamicDataKey: "plans",
    defaultData: { heading: "Plans & Pricing", subheading: "" },
    fields: [
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
    defaultData: { heading: "Upcoming events", limit: 6 },
    fields: [
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
    defaultData: { heading: "Shop", limit: 8 },
    fields: [
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

/** Build a fresh block of the given type with a unique id + default content. */
export function newBlock(type: string): Block {
  const def = BLOCK_REGISTRY[type];
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `blk_${crypto.randomUUID().slice(0, 8)}`
      : `blk_${Math.random().toString(36).slice(2, 10)}`;
  return { id, type, enabled: true, ...structuredClone(def?.defaultData ?? {}) };
}
