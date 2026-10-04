import type { StyleSections } from "../types";
import "./journal.css";
import { BenefitsContents } from "./benefits";
import { ContactColophon } from "./contact";
import { CoursesIssue } from "./courses";
import { CtaBand } from "./cta";
import { EventsProgramme } from "./events";
import { FaqSticky } from "./faq";
import { HeroEditorial, HeroIntro } from "./hero";
import { HowItWorksColumns } from "./how-it-works";
import { MomentsSpread } from "./moments";
import { PhilosophyPullquote } from "./philosophy";
import { PricingColumns } from "./pricing";
import { StoryLetter } from "./story";

/** "journal" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { editorial: HeroEditorial, intro: HeroIntro },
  story: { letter: StoryLetter },
  benefits: { contents: BenefitsContents },
  courseShowcase: { issue: CoursesIssue },
  howItWorks: { columns: HowItWorksColumns },
  philosophy: { pullquote: PhilosophyPullquote },
  moments: { strip: MomentsSpread },
  pricing: { columns: PricingColumns },
  faq: { sticky: FaqSticky },
  cta: { band: CtaBand },
  contact: { colophon: ContactColophon },
  events: { programme: EventsProgramme },
};
