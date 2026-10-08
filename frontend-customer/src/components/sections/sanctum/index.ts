import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./sanctum.css";
import { BenefitsGifts } from "./benefits";
import { ContactMessage } from "./contact";
import { CoursesPaths } from "./courses";
import { CtaBegin } from "./cta";
import { EventsGatherings } from "./events";
import { FaqQuestions } from "./faq";
import { HeroIntro, HeroOracle } from "./hero";
import { HowItWorksRitual } from "./how-it-works";
import { MomentsVisions } from "./moments";
import { PhilosophyInvocation } from "./philosophy";
import { PricingOfferings } from "./pricing";
import { StoryOrigin } from "./story";

/** "sanctum" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { oracle: HeroOracle, intro: HeroIntro },
  story: { origin: StoryOrigin },
  benefits: { gifts: BenefitsGifts },
  courseShowcase: { paths: CoursesPaths, rows: CoursesRows },
  howItWorks: { ritual: HowItWorksRitual },
  philosophy: { invocation: PhilosophyInvocation },
  moments: { visions: MomentsVisions },
  pricing: { offerings: PricingOfferings },
  faq: { questions: FaqQuestions },
  cta: { begin: CtaBegin },
  contact: { message: ContactMessage },
  events: { gatherings: EventsGatherings, rows: EventsRows },
};
