import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./trail.css";
import { BenefitsGearList } from "./benefits";
import { ContactBasecamp } from "./contact";
import { CoursesRoutes } from "./courses";
import { CtaLaceUp } from "./cta";
import { EventsMeetups } from "./events";
import { FaqRanger } from "./faq";
import { HeroIntro, HeroTrailhead } from "./hero";
import { HowItWorksWaypoints } from "./how-it-works";
import { MomentsPostcards } from "./moments";
import { PhilosophyTrailRule } from "./philosophy";
import { PricingPermits } from "./pricing";
import { StoryFieldNotes } from "./story";

/** "trail" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { trailhead: HeroTrailhead, intro: HeroIntro },
  story: { fieldnotes: StoryFieldNotes },
  benefits: { gearlist: BenefitsGearList },
  courseShowcase: { routes: CoursesRoutes, rows: CoursesRows },
  howItWorks: { waypoints: HowItWorksWaypoints },
  philosophy: { trailrule: PhilosophyTrailRule },
  moments: { postcards: MomentsPostcards },
  pricing: { permits: PricingPermits },
  faq: { ranger: FaqRanger },
  cta: { laceup: CtaLaceUp },
  contact: { basecamp: ContactBasecamp },
  events: { meetups: EventsMeetups, rows: EventsRows },
};
