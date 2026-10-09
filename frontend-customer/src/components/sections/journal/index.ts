import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./journal.css";
import { BenefitsContents } from "./benefits";
import { ContactColophon } from "./contact";
import { CoursesIssue } from "./courses";
import { CtaBand } from "./cta";
import { EventsProgramme } from "./events";
import { FaqSticky } from "./faq";
import { HeroCover, HeroEditorial, HeroIntro } from "./hero";
import { HowItWorksColumns } from "./how-it-works";
import { MomentsSpread } from "./moments";
import { PhilosophyPullquote } from "./philosophy";
import { PricingColumns } from "./pricing";
import { StoryLetter } from "./story";
import { defineKit } from "../kit-contract";
import {
  H1,
  H2,
  H3,
  Kicker,
  LABEL,
  PILL,
  PILL_ON_MOSS,
  Section,
  WRAP,
} from "./ui";

/** "journal" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { cover: HeroCover, editorial: HeroEditorial, intro: HeroIntro },
  story: { letter: StoryLetter },
  benefits: { contents: BenefitsContents },
  courseShowcase: { issue: CoursesIssue, rows: CoursesRows },
  howItWorks: { columns: HowItWorksColumns },
  philosophy: { pullquote: PhilosophyPullquote },
  moments: { strip: MomentsSpread },
  pricing: { columns: PricingColumns },
  faq: { sticky: FaqSticky },
  cta: { band: CtaBand },
  contact: { colophon: ContactColophon },
  events: { programme: EventsProgramme, rows: EventsRows },
};

/** Journal's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "journal",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  button: { primary: PILL, onInverse: PILL_ON_MOSS },
  tones: { base: "paper", surface: "surface", inverse: "moss" },
  Section,
  Kicker,
});
