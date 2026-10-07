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
