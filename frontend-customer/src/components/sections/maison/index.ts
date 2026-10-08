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
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_ON_BLACK,
  FRAME,
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

/** Maison's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "maison",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, onInverse: BTN_ON_BLACK },
  media: { frame: FRAME },
  tones: { base: "ivory", surface: "surface", inverse: "black" },
  Section,
  Kicker,
  Opener,
});
