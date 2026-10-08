import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./workshop.css";
import { BenefitsSkills } from "./benefits";
import { ContactVisit } from "./contact";
import { CourseShowcaseProjects } from "./courses";
import { CtaPickup } from "./cta";
import { EventsSessions } from "./events";
import { FaqTips } from "./faq";
import { HeroBench, HeroIntro } from "./hero";
import { HowItWorksSteps } from "./how-it-works";
import { MomentsGallery } from "./moments";
import { PhilosophyNote } from "./philosophy";
import { PricingKits } from "./pricing";
import { StoryMaker } from "./story";

/** "workshop" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { bench: HeroBench, intro: HeroIntro },
  story: { maker: StoryMaker },
  benefits: { skills: BenefitsSkills },
  courseShowcase: { projects: CourseShowcaseProjects, rows: CoursesRows },
  howItWorks: { steps: HowItWorksSteps },
  philosophy: { note: PhilosophyNote },
  moments: { gallery: MomentsGallery },
  pricing: { kits: PricingKits },
  faq: { tips: FaqTips },
  cta: { pickup: CtaPickup },
  contact: { visit: ContactVisit },
  events: { sessions: EventsSessions, rows: EventsRows },
};
