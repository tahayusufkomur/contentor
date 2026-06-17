// Built-in page templates — named sets of pre-arranged blocks a coach can apply
// to a page as a starting point (MailCraft-style "start from a template"). These
// ship with the app (versioned in code, no DB). Coach-saved templates live in
// `TenantConfig.page_templates`. Image fields are intentionally empty; the coach
// fills them in after applying. Block ids here are placeholders — they're
// re-minted when the template is applied.

import { BLOCK_REGISTRY } from "./registry";
import type { Block, PageKey, PageTemplate } from "@/types/tenant";

let seq = 0;

/** Build a template block from a registry type's defaults, with content overrides. */
function tb(type: string, overrides: Record<string, unknown> = {}): Block {
  const def = BLOCK_REGISTRY[type];
  seq += 1;
  return {
    id: `tpl-${seq}`,
    type,
    enabled: true,
    ...structuredClone(def?.defaultData ?? {}),
    ...overrides,
  } as Block;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "home-classic",
    name: "Classic",
    description: "Hero, courses, testimonials, and a closing call to action.",
    pageKeys: ["home"],
    blocks: [
      tb("hero", {
        heading: "Learn from the best",
        subheading: "Practical courses to help you grow, at your own pace.",
        ctaText: "Browse courses",
        ctaHref: "/courses",
      }),
      tb("courseGrid", { heading: "Featured courses" }),
      tb("testimonials", { heading: "What students say" }),
      tb("cta", {
        heading: "Ready to start?",
        buttonText: "Join now",
        buttonHref: "/courses",
      }),
    ],
  },
  {
    id: "home-storyteller",
    name: "Storyteller",
    description: "Lead with your story, back it with results, then convert.",
    pageKeys: ["home"],
    blocks: [
      tb("hero", {
        heading: "Your journey starts here",
        subheading: "A warm welcome to your new practice.",
      }),
      tb("imageText", {
        heading: "My approach",
        body: "Share what makes your teaching different.",
      }),
      tb("stats", {
        heading: "By the numbers",
        items: [
          { value: "500+", label: "Students" },
          { value: "4.9", label: "Average rating" },
          { value: "20+", label: "Courses" },
        ],
      }),
      tb("courseGrid", { heading: "Popular courses" }),
      tb("cta", {
        heading: "Join the community",
        buttonText: "Get started",
        buttonHref: "/courses",
      }),
    ],
  },
  {
    id: "home-minimal",
    name: "Minimal",
    description: "A clean hero and a single call to action.",
    pageKeys: ["home"],
    blocks: [
      tb("hero", {
        heading: "Welcome",
        subheading: "Everything you need, nothing you don't.",
      }),
      tb("cta", {
        heading: "Take the first step",
        buttonText: "Explore",
        buttonHref: "/courses",
      }),
    ],
  },
  {
    id: "about-founder",
    name: "Founder story",
    description:
      "An intro, a personal bio with a photo, and credibility stats.",
    pageKeys: ["about"],
    blocks: [
      tb("richText", {
        heading: "About",
        body: "Introduce yourself and your mission in a few sentences.",
      }),
      tb("imageText", {
        heading: "My story",
        body: "Tell students how you got here and why it matters.",
      }),
      tb("stats", {
        heading: "",
        items: [
          { value: "10 yrs", label: "Experience" },
          { value: "1,000+", label: "Students taught" },
        ],
      }),
    ],
  },
  {
    id: "pricing-plans-faq",
    name: "Plans & questions",
    description: "Your pricing plans followed by a short FAQ.",
    pageKeys: ["pricing"],
    blocks: [
      tb("pricingPlans", {
        heading: "Plans & Pricing",
        subheading: "Choose a plan that fits your goals.",
      }),
      tb("faq", {
        heading: "Frequently asked questions",
        items: [
          {
            q: "Can I cancel anytime?",
            a: "Yes — your plan stays active until the end of the period.",
          },
          {
            q: "Do you offer refunds?",
            a: "Reach out within 14 days and we'll sort it out.",
          },
        ],
      }),
    ],
  },
  {
    id: "contact-simple",
    name: "Get in touch",
    description: "A contact form with a short FAQ underneath.",
    pageKeys: ["contact"],
    blocks: [
      tb("contact", {
        heading: "Get in touch",
        intro: "Have a question? Send us a message.",
      }),
      tb("faq", { heading: "Common questions", items: [] }),
    ],
  },
];

/** Built-in templates offered for a given page (a template with no `pageKeys`
 *  is offered everywhere). */
export function templatesForPage(pageKey: PageKey): PageTemplate[] {
  return PAGE_TEMPLATES.filter(
    (t) => !t.pageKeys || t.pageKeys.includes(pageKey),
  );
}
