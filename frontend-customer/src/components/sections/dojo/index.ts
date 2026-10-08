import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./dojo.css";
import { BenefitsDisciplines } from "./benefits";
import { ContactDojoinfo } from "./contact";
import { CoursesBelts } from "./courses";
import { CtaJoin } from "./cta";
import { EventsTimetable } from "./events";
import { FaqEtiquette } from "./faq";
import { HeroBanner, HeroIntro } from "./hero";
import { HowItWorksPath } from "./how-it-works";
import { MomentsTraining } from "./moments";
import { PhilosophyCreed } from "./philosophy";
import { PricingDues } from "./pricing";
import { StoryLineage } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_INK,
  Enso,
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

/** "dojo" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { banner: HeroBanner, intro: HeroIntro },
  story: { lineage: StoryLineage },
  benefits: { disciplines: BenefitsDisciplines },
  courseShowcase: { belts: CoursesBelts, rows: CoursesRows },
  howItWorks: { path: HowItWorksPath },
  philosophy: { creed: PhilosophyCreed },
  moments: { training: MomentsTraining },
  pricing: { dues: PricingDues },
  faq: { etiquette: FaqEtiquette },
  cta: { join: CtaJoin },
  contact: { dojoinfo: ContactDojoinfo },
  events: { timetable: EventsTimetable, rows: EventsRows },
};

/** Dojo's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "dojo",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INK },
  tones: { base: "rice", surface: "surface", inverse: "ink" },
  Section,
  Kicker,
  Opener,
  ornaments: { glyph: Enso },
});
