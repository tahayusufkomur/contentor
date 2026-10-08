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
