import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./atelier.css";
import { BenefitsRituals } from "./benefits";
import { ContactStudio } from "./contact";
import { CoursesTreatments } from "./courses";
import { CtaAppointment } from "./cta";
import { EventsMasterclasses } from "./events";
import { FaqConsult } from "./faq";
import { HeroIntro, HeroPortrait } from "./hero";
import { HowItWorksRoutine } from "./how-it-works";
import { MomentsLookbook } from "./moments";
import { PhilosophyPullquote } from "./philosophy";
import { PricingMenu } from "./pricing";
import { StorySalon } from "./story";

/** "atelier" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { portrait: HeroPortrait, intro: HeroIntro },
  story: { salon: StorySalon },
  benefits: { rituals: BenefitsRituals },
  courseShowcase: { treatments: CoursesTreatments, rows: CoursesRows },
  howItWorks: { routine: HowItWorksRoutine },
  philosophy: { pullquote: PhilosophyPullquote },
  moments: { lookbook: MomentsLookbook },
  pricing: { menu: PricingMenu },
  faq: { consult: FaqConsult },
  cta: { appointment: CtaAppointment },
  contact: { studio: ContactStudio },
  events: { masterclasses: EventsMasterclasses, rows: EventsRows },
};
