import "./grid.css";
import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import { HeroIntro, HeroStatement } from "./hero";
import { StoryColumns } from "./story";
import { BenefitsIndex } from "./benefits";
import { CourseCatalogue } from "./course-showcase";
import { HowItWorksRuled } from "./how-it-works";
import { PhilosophyParagraph } from "./philosophy";
import { MomentsTiles } from "./moments";
import { PricingTable } from "./pricing";
import { FaqOpen } from "./faq";
import { CtaBlock } from "./cta";
import { ContactDefinition } from "./contact";
import { EventsTable } from "./events";
import { defineKit } from "../kit-contract";
import { Head, Sheet, btn } from "./ui";

/** "grid" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { statement: HeroStatement, intro: HeroIntro },
  story: { columns: StoryColumns },
  benefits: { index: BenefitsIndex },
  courseShowcase: { catalogue: CourseCatalogue, rows: CoursesRows },
  howItWorks: { ruled: HowItWorksRuled },
  philosophy: { paragraph: PhilosophyParagraph },
  moments: { tiles: MomentsTiles },
  pricing: { table: PricingTable },
  faq: { open: FaqOpen },
  cta: { block: CtaBlock },
  contact: { definition: ContactDefinition },
  events: { table: EventsTable, rows: EventsRows },
};

/** Swiss Grid's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "grid",
  wrap: "",
  display: "swiss-h1",
  h2: "swiss-h2",
  h3: "swiss-h3",
  label: "swiss-mono",
  button: { primary: btn.primary, ghost: btn.outline, onInverse: btn.onCobalt },
  tones: { base: "paper", surface: "fog", inverse: "cobalt" },
  Section: Sheet,
  Opener: Head,
});
