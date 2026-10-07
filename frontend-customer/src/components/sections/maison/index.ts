import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./maison.css";
import { BenefitsEdit } from "./benefits";
import { ContactAddress } from "./contact";
import { CoursesCollection } from "./courses";
import { CtaIntroduction } from "./cta";
import { EventsSalons } from "./events";
import { FaqNotes } from "./faq";
import { HeroIntro, HeroLookbook } from "./hero";
import { HowItWorksFittings } from "./how-it-works";
import { MomentsEditorial } from "./moments";
import { PhilosophyMaxim } from "./philosophy";
import { PricingAppointment } from "./pricing";
import { StoryAtelier } from "./story";

/** "maison" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { lookbook: HeroLookbook, intro: HeroIntro },
  story: { atelier: StoryAtelier },
  benefits: { edit: BenefitsEdit },
  courseShowcase: { collection: CoursesCollection, rows: CoursesRows },
  howItWorks: { fittings: HowItWorksFittings },
  philosophy: { maxim: PhilosophyMaxim },
  moments: { editorial: MomentsEditorial },
  pricing: { appointment: PricingAppointment },
  faq: { notes: FaqNotes },
  cta: { introduction: CtaIntroduction },
  contact: { address: ContactAddress },
  events: { salons: EventsSalons, rows: EventsRows },
};
