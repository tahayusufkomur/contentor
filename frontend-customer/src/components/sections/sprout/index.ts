import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./sprout.css";
import { BenefitsGrowth } from "./benefits";
import { ContactHello } from "./contact";
import { CourseShowcaseActivities } from "./courses";
import { CtaJoin } from "./cta";
import { EventsPlaydates } from "./events";
import { FaqAskaway } from "./faq";
import { HeroIntro, HeroPlayground } from "./hero";
import { HowItWorksSteps } from "./how-it-works";
import { MomentsSnapshots } from "./moments";
import { PhilosophyPromise } from "./philosophy";
import { PricingTickets } from "./pricing";
import { StoryHello } from "./story";

/** "sprout" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { playground: HeroPlayground, intro: HeroIntro },
  story: { hello: StoryHello },
  benefits: { growth: BenefitsGrowth },
  courseShowcase: { activities: CourseShowcaseActivities, rows: CoursesRows },
  howItWorks: { steps: HowItWorksSteps },
  philosophy: { promise: PhilosophyPromise },
  moments: { snapshots: MomentsSnapshots },
  pricing: { tickets: PricingTickets },
  faq: { askaway: FaqAskaway },
  cta: { join: CtaJoin },
  contact: { hello: ContactHello },
  events: { playdates: EventsPlaydates, rows: EventsRows },
};
