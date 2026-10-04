import type { StyleSections } from "../types";
import "./kinetic.css";
import { BenefitsSpec } from "./benefits";
import { ContactBigmail } from "./contact";
import { CoursesPosters } from "./courses";
import { CtaBand } from "./cta";
import { EventsTimetable } from "./events";
import { FaqNumbered } from "./faq";
import { HeroIntro, HeroPoster } from "./hero";
import { HowItWorksTrack } from "./how-it-works";
import { MomentsMarquee } from "./moments";
import { PhilosophyStatement } from "./philosophy";
import { PricingTickets } from "./pricing";
import { StoryOutline } from "./story";

/** "kinetic" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { poster: HeroPoster, intro: HeroIntro },
  story: { outline: StoryOutline },
  benefits: { spec: BenefitsSpec },
  courseShowcase: { posters: CoursesPosters },
  howItWorks: { track: HowItWorksTrack },
  philosophy: { statement: PhilosophyStatement },
  moments: { marquee: MomentsMarquee },
  pricing: { tickets: PricingTickets },
  faq: { numbered: FaqNumbered },
  cta: { band: CtaBand },
  contact: { bigmail: ContactBigmail },
  events: { timetable: EventsTimetable },
};
