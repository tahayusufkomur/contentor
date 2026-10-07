import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./ledger.css";
import { BenefitsClauses } from "./benefits";
import { ContactLetterhead } from "./contact";
import { CoursesDossier } from "./courses";
import { CtaSignature } from "./cta";
import { EventsAgenda } from "./events";
import { FaqAppendix } from "./faq";
import { HeroIntro, HeroStatement } from "./hero";
import { HowItWorksQuarters } from "./how-it-works";
import { MomentsFigures } from "./moments";
import { PhilosophyPrinciples } from "./philosophy";
import { PricingTable } from "./pricing";
import { StoryMemo } from "./story";

/** "ledger" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { statement: HeroStatement, intro: HeroIntro },
  story: { memo: StoryMemo },
  benefits: { clauses: BenefitsClauses },
  courseShowcase: { dossier: CoursesDossier, rows: CoursesRows },
  howItWorks: { quarters: HowItWorksQuarters },
  philosophy: { principles: PhilosophyPrinciples },
  moments: { figures: MomentsFigures },
  pricing: { table: PricingTable },
  faq: { appendix: FaqAppendix },
  cta: { signature: CtaSignature },
  contact: { letterhead: ContactLetterhead },
  events: { agenda: EventsAgenda, rows: EventsRows },
};
