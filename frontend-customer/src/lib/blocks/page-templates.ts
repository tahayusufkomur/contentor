// Built-in page templates — named sets of pre-arranged blocks a creator can
// apply to a page as a starting point (MailCraft-style "start from a template").
// These ship with the app (versioned in code, no DB). Creator-saved templates
// live in `TenantConfig.page_templates`. Image fields are intentionally empty;
// the creator fills them in after applying. Block ids here are placeholders —
// they're re-minted when the template is applied.
//
// A template is named in the creator's language (`admin.owner.blockLib.template`)
// and its blocks are written in the site's (`blocks.template.<id>.<blockType>`):
// that is what lands on the page, once, and is hers after.

import { camel, type Say } from "./say";
import type { BlockDefinition } from "./types";
import type { Block, PageTemplate } from "@/types/tenant";

export function builtInTemplates(
  registry: Record<string, BlockDefinition>,
  ui: Say,
  site: Say,
): PageTemplate[] {
  let seq = 0;

  /** A template block: the type's defaults, the template's own words, and the
   *  fields that are not words (links, empty lists). */
  const tb = (
    template: string,
    type: string,
    extra: Record<string, unknown> = {},
  ): Block => {
    seq += 1;
    return {
      id: `tpl-${seq}`,
      type,
      enabled: true,
      ...structuredClone(registry[type]?.defaultData ?? {}),
      ...(structuredClone(
        site.raw(`template.${camel(template)}.${type}`),
      ) as Record<string, unknown>),
      ...extra,
    } as Block;
  };

  const named = (id: string, pageKeys: PageTemplate["pageKeys"]) => ({
    id,
    name: ui(`template.${camel(id)}.name`),
    description: ui(`template.${camel(id)}.description`),
    pageKeys,
  });

  return [
    {
      ...named("home-classic", ["home"]),
      blocks: [
        tb("home-classic", "hero", { ctaHref: "/courses" }),
        tb("home-classic", "courseGrid"),
        tb("home-classic", "testimonials"),
        tb("home-classic", "cta", { buttonHref: "/courses" }),
      ],
    },
    {
      ...named("home-storyteller", ["home"]),
      blocks: [
        tb("home-storyteller", "hero"),
        tb("home-storyteller", "imageText"),
        tb("home-storyteller", "stats"),
        tb("home-storyteller", "courseGrid"),
        tb("home-storyteller", "cta", { buttonHref: "/courses" }),
      ],
    },
    {
      ...named("home-minimal", ["home"]),
      blocks: [
        tb("home-minimal", "hero"),
        tb("home-minimal", "cta", { buttonHref: "/courses" }),
      ],
    },
    {
      ...named("about-founder", ["about"]),
      blocks: [
        tb("about-founder", "richText"),
        tb("about-founder", "imageText"),
        tb("about-founder", "stats", { heading: "" }),
      ],
    },
    {
      ...named("pricing-plans-faq", ["pricing"]),
      blocks: [
        tb("pricing-plans-faq", "pricingPlans"),
        tb("pricing-plans-faq", "faq"),
      ],
    },
    {
      ...named("contact-simple", ["contact"]),
      blocks: [
        tb("contact-simple", "contact"),
        tb("contact-simple", "faq", { items: [] }),
      ],
    },
  ];
}
