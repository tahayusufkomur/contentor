import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./encore.css";
import { BenefitsSetlist } from "./benefits";
import { ContactBooking } from "./contact";
import { CoursesTracklist } from "./courses";
import { CtaEncore } from "./cta";
import { EventsTourDates } from "./events";
import { FaqBSides } from "./faq";
import { HeroIntro, HeroPoster } from "./hero";
import { HowItWorksSoundcheck } from "./how-it-works";
import { MomentsSleeves } from "./moments";
import { PhilosophyManifesto } from "./philosophy";
import { PricingPasses } from "./pricing";
import { StoryLinerNotes } from "./story";

/** "encore" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { poster: HeroPoster, intro: HeroIntro },
  story: { linernotes: StoryLinerNotes },
  benefits: { setlist: BenefitsSetlist },
  courseShowcase: { tracklist: CoursesTracklist, rows: CoursesRows },
  howItWorks: { soundcheck: HowItWorksSoundcheck },
  philosophy: { manifesto: PhilosophyManifesto },
  moments: { sleeves: MomentsSleeves },
  pricing: { passes: PricingPasses },
  faq: { bsides: FaqBSides },
  cta: { encore: CtaEncore },
  contact: { booking: ContactBooking },
  events: { tourdates: EventsTourDates, rows: EventsRows },
};
