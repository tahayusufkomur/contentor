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
import { CX_BLOCK_TYPE } from "@shared/cx/types";
import type { Block, PageKey, PageTemplate } from "@/types/tenant";
import type { BlockDefinition, BlockGroup, DynamicDataKey } from "./types";
import type { FieldSchema } from "./field-schema";
import { exampleFor } from "./examples";
import { cxBlockDef, cxDynamicKey } from "./cx-defs";
import { builtInTemplates } from "./page-templates";
import { ENGLISH_CONTENT, NO_WORDS, type Say } from "./say";
import {
  buildSectionDefs,
  isSectionType,
  sectionDefaultData,
  sectionFamily,
} from "./section-defs";

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

/** Every block type's definition. `ui` names things in the creator's language
 *  (admin.owner.blockLib); `site` is the language a new block's starting
 *  content is written in (blocks.default). */
export function buildBlockRegistry(
  ui: Say,
  site: Say,
): Record<string, BlockDefinition> {
  /** A "Layout" select field. Each entry is `[value, label]`; the first value is
   *  the block's default layout (kept in `defaultData.layout`). Every block has
   *  one so a creator can switch structural arrangement without losing content. */
  const layoutField = (options: [string, string][]): FieldSchema => ({
    key: "layout",
    label: ui("layout.label"),
    type: "select",
    display: "icons",
    options: options.map(([value, label]) => ({ label, value })),
  });

  return {
    hero: {
      type: "hero",
      label: ui("block.hero"),
      icon: Megaphone,
      group: "content",
      component: HeroBlock,
      defaultData: {
        layout: "centered",
        heading: site("default.hero.heading"),
        subheading: site("default.hero.subheading"),
        ctaText: site("default.hero.ctaText"),
        ctaHref: "/courses",
        bgImage: { ...EMPTY_IMAGE },
        overlay: "dark",
        overlayStrength: "medium",
      },
      fields: [
        layoutField([
          ["centered", ui("layout.centeredFullBleed")],
          ["split", ui("layout.splitTextImage")],
          ["minimal", ui("layout.minimal")],
        ]),
        {
          key: "heading",
          label: ui("field.headline"),
          type: "text",
          required: true,
        },
        { key: "subheading", label: ui("field.subheadline"), type: "text" },
        { key: "ctaText", label: ui("field.buttonText"), type: "text" },
        { key: "ctaHref", label: ui("field.buttonLink"), type: "link" },
        {
          key: "bgImage",
          label: ui("field.image"),
          type: "image",
          helpText: ui("help.imageBackground"),
        },
        {
          key: "overlay",
          label: ui("field.imageShade"),
          type: "select",
          helpText: ui("help.shade"),
          showWhen: (d) => (d.layout ?? "centered") === "centered",
          options: [
            { label: ui("option.none"), value: "none" },
            { label: ui("option.dark"), value: "dark" },
            { label: ui("option.light"), value: "light" },
          ],
        },
        {
          key: "overlayStrength",
          label: ui("field.shadeStrength"),
          type: "select",
          display: "slider",
          showWhen: (d) =>
            (d.layout ?? "centered") === "centered" &&
            !!d.overlay &&
            d.overlay !== "none",
          options: [
            { label: ui("option.light"), value: "light" },
            { label: ui("option.medium"), value: "medium" },
            { label: ui("option.strong"), value: "strong" },
          ],
        },
      ],
    },
    richText: {
      type: "richText",
      label: ui("block.richText"),
      icon: AlignLeft,
      group: "content",
      component: RichTextBlock,
      defaultData: {
        layout: "standard",
        heading: site("default.richText.heading"),
        headingLevel: "h2",
        body: "",
      },
      fields: [
        layoutField([
          ["standard", ui("layout.standard")],
          ["centered", ui("layout.centered")],
          ["wide", ui("layout.wide")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        {
          key: "headingLevel",
          label: ui("field.headingSize"),
          type: "select",
          display: "slider",
          options: [
            { label: ui("option.largest"), value: "h1" },
            { label: ui("option.large"), value: "h2" },
            { label: ui("option.medium"), value: "h3" },
            { label: ui("option.small"), value: "h4" },
          ],
        },
        { key: "body", label: ui("field.body"), type: "richtext" },
      ],
    },
    imageText: {
      type: "imageText",
      label: ui("block.imageText"),
      icon: Columns2,
      group: "content",
      component: ImageTextBlock,
      defaultData: {
        layout: "split",
        heading: site("default.imageText.heading"),
        headingLevel: "h2",
        body: "",
        image: { ...EMPTY_IMAGE },
        imagePosition: "right",
      },
      fields: [
        layoutField([
          ["split", ui("layout.sideBySide")],
          ["stacked", ui("layout.stacked")],
          ["card", ui("layout.card")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        {
          key: "headingLevel",
          label: ui("field.headingSize"),
          type: "select",
          display: "slider",
          options: [
            { label: ui("option.largest"), value: "h1" },
            { label: ui("option.large"), value: "h2" },
            { label: ui("option.medium"), value: "h3" },
            { label: ui("option.small"), value: "h4" },
          ],
        },
        { key: "body", label: ui("field.body"), type: "richtext" },
        { key: "image", label: ui("field.image"), type: "image" },
        {
          key: "imagePosition",
          label: ui("field.imagePosition"),
          type: "select",
          options: [
            { label: ui("option.right"), value: "right" },
            { label: ui("option.left"), value: "left" },
          ],
        },
      ],
    },
    gallery: {
      type: "gallery",
      label: ui("block.gallery"),
      icon: Images,
      group: "content",
      component: GalleryBlock,
      defaultData: {
        layout: "grid",
        heading: site("default.gallery.heading"),
        items: [],
      },
      fields: [
        layoutField([
          ["grid", ui("layout.grid")],
          ["masonry", ui("layout.masonry")],
          ["carousel", ui("layout.carousel")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        {
          key: "items",
          label: ui("field.images"),
          type: "repeater",
          itemLabel: ui("item.image"),
          itemKind: "image",
          itemFields: [
            {
              key: "image",
              label: ui("field.image"),
              type: "image",
              required: true,
            },
            { key: "caption", label: ui("field.caption"), type: "text" },
          ],
        },
      ],
    },
    testimonials: {
      type: "testimonials",
      label: ui("block.testimonials"),
      icon: Quote,
      group: "content",
      component: TestimonialsBlock,
      defaultData: {
        layout: "cards",
        heading: site("default.testimonials.heading"),
        items: [],
      },
      fields: [
        layoutField([
          ["cards", ui("layout.cards")],
          ["quote", ui("layout.largeQuote")],
          ["list", ui("layout.list")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        {
          key: "items",
          label: ui("field.testimonials"),
          type: "repeater",
          itemLabel: ui("item.testimonial"),
          itemKind: "testimonial",
          itemFields: [
            {
              key: "name",
              label: ui("field.name"),
              type: "text",
              required: true,
            },
            { key: "role", label: ui("field.role"), type: "text" },
            {
              key: "text",
              label: ui("field.quote"),
              type: "textarea",
              required: true,
            },
            {
              key: "rating",
              label: ui("field.rating"),
              type: "select",
              options: [
                { label: ui("option.none"), value: "" },
                { label: "1", value: "1" },
                { label: "2", value: "2" },
                { label: "3", value: "3" },
                { label: "4", value: "4" },
                { label: "5", value: "5" },
              ],
            },
            { key: "avatar", label: ui("field.avatar"), type: "image" },
          ],
        },
      ],
    },
    faq: {
      type: "faq",
      label: ui("block.faq"),
      icon: HelpCircle,
      group: "content",
      component: FaqBlock,
      defaultData: {
        layout: "accordion",
        heading: site("default.faq.heading"),
        items: [],
      },
      fields: [
        layoutField([
          ["accordion", ui("layout.accordion")],
          ["open", ui("layout.openList")],
          ["columns", ui("layout.twoColumns")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        {
          key: "items",
          label: ui("field.questions"),
          type: "repeater",
          itemLabel: ui("item.question"),
          itemKind: "question",
          itemFields: [
            {
              key: "q",
              label: ui("field.question"),
              type: "text",
              required: true,
            },
            {
              key: "a",
              label: ui("field.answer"),
              type: "textarea",
              required: true,
            },
          ],
        },
      ],
    },
    cta: {
      type: "cta",
      label: ui("block.cta"),
      icon: MousePointerClick,
      group: "content",
      component: CtaBlock,
      defaultData: {
        layout: "centered",
        heading: site("default.cta.heading"),
        buttonText: site("default.cta.buttonText"),
        buttonHref: "/courses",
      },
      fields: [
        layoutField([
          ["centered", ui("layout.centered")],
          ["banner", ui("layout.banner")],
          ["split", ui("layout.split")],
        ]),
        {
          key: "heading",
          label: ui("field.heading"),
          type: "text",
          required: true,
        },
        { key: "buttonText", label: ui("field.buttonText"), type: "text" },
        { key: "buttonHref", label: ui("field.buttonLink"), type: "link" },
        {
          key: "secondaryButtonText",
          label: ui("field.secondaryButtonText"),
          type: "text",
          helpText: ui("help.secondaryButton"),
        },
        {
          key: "secondaryButtonHref",
          label: ui("field.secondaryButtonLink"),
          type: "link",
        },
      ],
    },
    stats: {
      type: "stats",
      label: ui("block.stats"),
      icon: BarChart3,
      group: "content",
      component: StatsBlock,
      defaultData: { layout: "cards", heading: "", items: [] },
      fields: [
        layoutField([
          ["cards", ui("layout.cards")],
          ["plain", ui("layout.plain")],
          ["band", ui("layout.band")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        {
          key: "items",
          label: ui("field.stats"),
          type: "repeater",
          itemLabel: ui("item.stat"),
          itemKind: "stat",
          itemFields: [
            {
              key: "value",
              label: ui("field.value"),
              type: "text",
              required: true,
            },
            {
              key: "label",
              label: ui("field.label"),
              type: "text",
              required: true,
            },
          ],
        },
      ],
    },
    logos: {
      type: "logos",
      label: ui("block.logos"),
      icon: Building2,
      group: "content",
      component: LogosBlock,
      defaultData: {
        layout: "row",
        heading: site("default.logos.heading"),
        items: [],
      },
      fields: [
        layoutField([
          ["row", ui("layout.row")],
          ["grid", ui("layout.grid")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        {
          key: "items",
          label: ui("field.logos"),
          type: "repeater",
          itemLabel: ui("item.logo"),
          itemKind: "logo",
          itemFields: [
            {
              key: "image",
              label: ui("field.logo"),
              type: "image",
              required: true,
            },
            { key: "alt", label: ui("field.altText"), type: "text" },
          ],
        },
      ],
    },
    video: {
      type: "video",
      label: ui("block.video"),
      icon: VideoIcon,
      group: "content",
      component: VideoBlock,
      defaultData: {
        layout: "standard",
        heading: "",
        video: { ...EMPTY_VIDEO },
      },
      fields: [
        layoutField([
          ["standard", ui("layout.standard")],
          ["wide", ui("layout.wide")],
          ["full", ui("layout.fullWidth")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        {
          key: "video",
          label: ui("field.video"),
          type: "video",
          helpText: ui("help.video"),
        },
      ],
    },
    banner: {
      type: "banner",
      label: ui("block.banner"),
      icon: Flag,
      group: "content",
      component: BannerBlock,
      defaultData: {
        layout: "bar",
        text: site("default.banner.text"),
        linkText: "",
        linkHref: "",
        dismissible: false,
      },
      fields: [
        layoutField([
          ["bar", ui("layout.bar")],
          ["full", ui("layout.fullWidth")],
          ["soft", ui("layout.soft")],
        ]),
        { key: "text", label: ui("field.text"), type: "text", required: true },
        { key: "linkText", label: ui("field.linkText"), type: "text" },
        { key: "linkHref", label: ui("field.link"), type: "link" },
        {
          key: "dismissible",
          label: ui("field.dismissible"),
          type: "toggle",
          helpText: ui("help.dismissible"),
        },
      ],
    },
    contact: {
      type: "contact",
      label: ui("block.contact"),
      icon: Mail,
      group: "content",
      component: ContactBlock,
      defaultData: {
        layout: "centered",
        heading: site("default.contact.heading"),
        intro: site("default.contact.intro"),
        submitLabel: site("default.contact.submitLabel"),
        successMessage: site("default.contact.successMessage"),
      },
      fields: [
        layoutField([
          ["centered", ui("layout.centered")],
          ["split", ui("layout.split")],
          ["card", ui("layout.card")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        { key: "intro", label: ui("field.intro"), type: "textarea" },
        { key: "submitLabel", label: ui("field.submitLabel"), type: "text" },
        {
          key: "successMessage",
          label: ui("field.successMessage"),
          type: "text",
        },
      ],
    },

    // --- Dynamic blocks ---
    courseGrid: {
      type: "courseGrid",
      label: ui("block.courseGrid"),
      icon: BookOpen,
      group: "dynamic",
      component: CourseGridBlock,
      dynamicDataKey: "courses",
      defaultData: {
        layout: "standard",
        heading: site("default.courseGrid.heading"),
        limit: 0,
        columns: "3",
        cardStyle: "elevated",
        showFilters: true,
        showPrice: true,
        showMeta: true,
        filterGroups: [],
      },
      fields: [
        layoutField([
          ["standard", ui("layout.leftHeading")],
          ["centered", ui("layout.centeredHeading")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        { key: "limit", label: ui("field.maxCourses"), type: "number" },
        {
          key: "columns",
          label: ui("field.columns"),
          type: "select",
          display: "slider",
          options: [
            { label: "2", value: "2" },
            { label: "3", value: "3" },
            { label: "4", value: "4" },
          ],
        },
        {
          key: "cardStyle",
          label: ui("field.cardStyle"),
          type: "select",
          options: [
            { label: ui("option.elevated"), value: "elevated" },
            { label: ui("option.bordered"), value: "bordered" },
            { label: ui("option.minimal"), value: "minimal" },
            { label: ui("option.overlay"), value: "overlay" },
          ],
        },
        { key: "showFilters", label: ui("field.showFilters"), type: "toggle" },
        { key: "showPrice", label: ui("field.showPrice"), type: "toggle" },
        { key: "showMeta", label: ui("field.showMeta"), type: "toggle" },
        {
          key: "filterGroups",
          label: ui("field.filterFacets"),
          type: "filterGroups",
          filterScope: "course",
          helpText: ui("help.filterFacets"),
        },
      ],
    },
    pricingPlans: {
      type: "pricingPlans",
      label: ui("block.pricingPlans"),
      icon: CreditCard,
      group: "dynamic",
      component: PricingPlansBlock,
      dynamicDataKey: "plans",
      defaultData: {
        layout: "cards",
        heading: site("default.pricingPlans.heading"),
        subheading: "",
      },
      fields: [
        layoutField([
          ["cards", ui("layout.cards")],
          ["compact", ui("layout.compact")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        { key: "subheading", label: ui("field.subheading"), type: "text" },
      ],
    },
    upcomingEvents: {
      type: "upcomingEvents",
      label: ui("block.upcomingEvents"),
      icon: CalendarDays,
      group: "dynamic",
      component: UpcomingEventsBlock,
      dynamicDataKey: "events",
      defaultData: {
        layout: "grid",
        heading: site("default.upcomingEvents.heading"),
        limit: 6,
        showCovers: true,
        filterGroups: [],
      },
      fields: [
        layoutField([
          ["grid", ui("layout.grid")],
          ["list", ui("layout.list")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        { key: "limit", label: ui("field.maxEvents"), type: "number" },
        { key: "showCovers", label: ui("field.showCovers"), type: "toggle" },
        {
          key: "filterGroups",
          label: ui("field.filterFacets"),
          type: "filterGroups",
          filterScope: "event",
          helpText: ui("help.filterFacets"),
        },
      ],
    },
    storeProducts: {
      type: "storeProducts",
      label: ui("block.storeProducts"),
      icon: ShoppingBag,
      group: "dynamic",
      component: StoreProductsBlock,
      dynamicDataKey: "storeProducts",
      defaultData: {
        layout: "grid",
        heading: site("default.storeProducts.heading"),
        limit: 8,
      },
      fields: [
        layoutField([
          ["grid", ui("layout.grid")],
          ["list", ui("layout.list")],
        ]),
        { key: "heading", label: ui("field.heading"), type: "text" },
        { key: "limit", label: ui("field.maxProducts"), type: "number" },
      ],
    },
    // --- Styled sections (one def per family; the variant picks the layout) ---
    // --- Styled sections (one def per family; the variant picks the layout) ---
    ...buildSectionDefs(ui, site),
    [CX_BLOCK_TYPE]: cxBlockDef(ui),
  };
}

/** What the code needs of a block type (its component, dataset and icon), never
 *  its name or its starting words: use `useBlockLibrary()` for those. */
export const BLOCK_REGISTRY = buildBlockRegistry(NO_WORDS, ENGLISH_CONTENT);

export function getBlockDef(type: string): BlockDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(BLOCK_REGISTRY, type)
    ? BLOCK_REGISTRY[type]
    : undefined;
}

/** The dataset a block renders: its type's, or for an AI-built section the
 *  one its spec names. */
export function dynamicKeyOf(block: Block): DynamicDataKey | undefined {
  return getBlockDef(block.type)?.dynamicDataKey ?? cxDynamicKey(block);
}

/** Dynamic datasets referenced by the enabled blocks on a page. */
export function dynamicKeysForBlocks(blocks: Block[]): Set<DynamicDataKey> {
  const keys = new Set<DynamicDataKey>();
  for (const block of blocks) {
    if (block.enabled === false) continue;
    const key = dynamicKeyOf(block);
    if (key) keys.add(key);
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

/** The block library as one creator sees and uses it: names in her language
 *  (`ui`), new blocks and built-in templates written in the site's (`site`). */
export function makeBlockLibrary(ui: Say, site: Say) {
  const registry = buildBlockRegistry(ui, site);
  const defs = Object.values(registry);
  const def = (type: string): BlockDefinition | undefined =>
    Object.prototype.hasOwnProperty.call(registry, type)
      ? registry[type]
      : undefined;
  return {
    def,
    /** The palette: every block of one group. */
    byGroup: (group: BlockGroup) => defs.filter((b) => b.group === group),
    /** A fresh block of the given type with a unique id + niche-aware example
     *  content, written in the site's language. Static content blocks (hero,
     *  testimonials, faq, ...) are seeded with example copy matching the
     *  tenant's `niche` (generic fallback when unknown). Media/dynamic blocks
     *  get example heading/intro text too; their images and live items
     *  (courses/plans/events/products) still come from the creator. */
    newBlock(type: string, niche?: string, siteStyle?: string): Block {
      if (isSectionType(type)) {
        return {
          id: mintBlockId(),
          type,
          enabled: true,
          ...sectionDefaultData(sectionFamily(type), siteStyle, site),
        };
      }
      return {
        id: mintBlockId(),
        type,
        enabled: true,
        ...structuredClone(def(type)?.defaultData ?? {}),
        ...exampleFor(type, niche, site),
      };
    },
    /** Built-in templates offered for a page (one with no `pageKeys` is offered
     *  everywhere): named in her language, their blocks in the site's. */
    templatesFor: (pageKey: PageKey): PageTemplate[] =>
      builtInTemplates(registry, ui, site).filter(
        (t) => !t.pageKeys || t.pageKeys.includes(pageKey),
      ),
  };
}
