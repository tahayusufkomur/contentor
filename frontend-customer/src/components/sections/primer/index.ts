import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./primer.css";
import { BenefitsOutcomes } from "./benefits";
import { ContactOfficeHours } from "./contact";
import { CoursesSyllabus } from "./courses";
import { CtaEnrol } from "./cta";
import { EventsTermDates } from "./events";
import { FaqGlossary } from "./faq";
import { HeroIntro, HeroTitlePage } from "./hero";
import { HowItWorksLessonPlan } from "./how-it-works";
import { MomentsClassroom } from "./moments";
import { PhilosophyMarginNote } from "./philosophy";
import { PricingTermFees } from "./pricing";
import { StoryForeword } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_INK,
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

/** "primer" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { titlepage: HeroTitlePage, intro: HeroIntro },
  story: { foreword: StoryForeword },
  benefits: { outcomes: BenefitsOutcomes },
  courseShowcase: { syllabus: CoursesSyllabus, rows: CoursesRows },
  howItWorks: { lessonplan: HowItWorksLessonPlan },
  philosophy: { marginnote: PhilosophyMarginNote },
  moments: { classroom: MomentsClassroom },
  pricing: { termfees: PricingTermFees },
  faq: { glossary: FaqGlossary },
  cta: { enrol: CtaEnrol },
  contact: { officehours: ContactOfficeHours },
  events: { termdates: EventsTermDates, rows: EventsRows },
};

/** Primer's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "primer",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INK },
  tones: { base: "paper", surface: "ruled", inverse: "ink" },
  Section,
  Kicker,
  Opener,
});
