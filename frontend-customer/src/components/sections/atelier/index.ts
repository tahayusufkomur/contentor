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
import { defineKit } from "../kit-contract";
import {
  ARCH,
  BTN,
  BTN_GHOST,
  BTN_ON_INVERSE,
  Diamond,
  Divider,
  H1,
  H2,
  H3,
  Kicker,
  LABEL,
  NUM,
  Opener,
  Section,
  WRAP,
} from "./ui";

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

/** Atelier's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "atelier",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  media: { arch: ARCH },
  tones: { base: "blush", surface: "surface", inverse: "inverse" },
  Section,
  Kicker,
  Opener,
  ornaments: { divider: Divider, glyph: Diamond },
});
