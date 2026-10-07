import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./darkroom.css";
import { BenefitsCatalogue } from "./benefits";
import { ContactHours } from "./contact";
import { CoursesPlates } from "./courses";
import { CtaPrivateView } from "./cta";
import { EventsOpenings } from "./events";
import { FaqDidactics } from "./faq";
import { HeroExhibition, HeroIntro } from "./hero";
import { HowItWorksContactSheet } from "./how-it-works";
import { MomentsGrid } from "./moments";
import { PhilosophyWallText } from "./philosophy";
import { PricingEditions } from "./pricing";
import { StoryStatement } from "./story";

/** "darkroom" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { exhibition: HeroExhibition, intro: HeroIntro },
  story: { statement: StoryStatement },
  benefits: { catalogue: BenefitsCatalogue },
  courseShowcase: { plates: CoursesPlates, rows: CoursesRows },
  howItWorks: { contactsheet: HowItWorksContactSheet },
  philosophy: { walltext: PhilosophyWallText },
  moments: { grid: MomentsGrid },
  pricing: { editions: PricingEditions },
  faq: { didactics: FaqDidactics },
  cta: { privateview: CtaPrivateView },
  contact: { hours: ContactHours },
  events: { openings: EventsOpenings, rows: EventsRows },
};
