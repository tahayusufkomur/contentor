import "./grid.css";
import type { StyleSections } from "../types";
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

/** "grid" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { statement: HeroStatement, intro: HeroIntro },
  story: { columns: StoryColumns },
  benefits: { index: BenefitsIndex },
  courseShowcase: { catalogue: CourseCatalogue },
  howItWorks: { ruled: HowItWorksRuled },
  philosophy: { paragraph: PhilosophyParagraph },
  moments: { tiles: MomentsTiles },
  pricing: { table: PricingTable },
  faq: { open: FaqOpen },
  cta: { block: CtaBlock },
  contact: { definition: ContactDefinition },
  events: { table: EventsTable },
};
