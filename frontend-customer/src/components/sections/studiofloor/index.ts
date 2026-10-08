import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./studiofloor.css";
import { BenefitsMoves } from "./benefits";
import { ContactBooking } from "./contact";
import { CourseShowcaseSetlist } from "./courses";
import { CtaSpotlight } from "./cta";
import { EventsSchedule } from "./events";
import { FaqWarmup } from "./faq";
import { HeroIntro, HeroStage } from "./hero";
import { HowItWorksRehearsal } from "./how-it-works";
import { MomentsReel } from "./moments";
import { PhilosophyMirror } from "./philosophy";
import { PricingPasses } from "./pricing";
import { StoryBackstage } from "./story";

/** "studiofloor" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { stage: HeroStage, intro: HeroIntro },
  story: { backstage: StoryBackstage },
  benefits: { moves: BenefitsMoves },
  courseShowcase: { setlist: CourseShowcaseSetlist, rows: CoursesRows },
  howItWorks: { rehearsal: HowItWorksRehearsal },
  philosophy: { mirror: PhilosophyMirror },
  moments: { reel: MomentsReel },
  pricing: { passes: PricingPasses },
  faq: { warmup: FaqWarmup },
  cta: { spotlight: CtaSpotlight },
  contact: { booking: ContactBooking },
  events: { schedule: EventsSchedule, rows: EventsRows },
};
