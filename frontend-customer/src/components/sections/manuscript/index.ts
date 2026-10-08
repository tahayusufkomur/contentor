import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./manuscript.css";
import { BenefitsChapters } from "./benefits";
import { ContactLetter } from "./contact";
import { CoursesContents } from "./courses";
import { CtaSubscribe } from "./cta";
import { EventsReadings } from "./events";
import { FaqNotes } from "./faq";
import { HeroIntro, HeroTitlepage } from "./hero";
import { HowItWorksProcess } from "./how-it-works";
import { MomentsPlates } from "./moments";
import { PhilosophyEpigraph } from "./philosophy";
import { PricingSubscriptions } from "./pricing";
import { StoryPreface } from "./story";

/** "manuscript" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { titlepage: HeroTitlepage, intro: HeroIntro },
  story: { preface: StoryPreface },
  benefits: { chapters: BenefitsChapters },
  courseShowcase: { contents: CoursesContents, rows: CoursesRows },
  howItWorks: { process: HowItWorksProcess },
  philosophy: { epigraph: PhilosophyEpigraph },
  moments: { plates: MomentsPlates },
  pricing: { subscriptions: PricingSubscriptions },
  faq: { notes: FaqNotes },
  cta: { subscribe: CtaSubscribe },
  contact: { letter: ContactLetter },
  events: { readings: EventsReadings, rows: EventsRows },
};
