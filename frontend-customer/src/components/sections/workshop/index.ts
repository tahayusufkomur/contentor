import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./workshop.css";
import { BenefitsSkills } from "./benefits";
import { ContactVisit } from "./contact";
import { CourseShowcaseProjects } from "./courses";
import { CtaPickup } from "./cta";
import { EventsSessions } from "./events";
import { FaqTips } from "./faq";
import { HeroBench, HeroIntro, HeroPinboard } from "./hero";
import { HowItWorksSteps } from "./how-it-works";
import { MomentsGallery } from "./moments";
import { PhilosophyNote } from "./philosophy";
import { PricingKits } from "./pricing";
import { StoryNotecard, StoryMaker } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_INK,
  CARD,
  H1,
  H2,
  H3,
  HAND,
  HandArrow,
  Kicker,
  NUM,
  Opener,
  Section,
  WRAP,
} from "./ui";

/** "workshop" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { pinboard: HeroPinboard, bench: HeroBench, intro: HeroIntro },
  story: { notecard: StoryNotecard, maker: StoryMaker },
  benefits: { skills: BenefitsSkills },
  courseShowcase: { projects: CourseShowcaseProjects, rows: CoursesRows },
  howItWorks: { steps: HowItWorksSteps },
  philosophy: { note: PhilosophyNote },
  moments: { gallery: MomentsGallery },
  pricing: { kits: PricingKits },
  faq: { tips: FaqTips },
  cta: { pickup: CtaPickup },
  contact: { visit: ContactVisit },
  events: { sessions: EventsSessions, rows: EventsRows },
};

/** Workshop's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "workshop",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: HAND,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INK },
  card: CARD,
  tones: { base: "kraft", surface: "lined", inverse: "inverse" },
  Section,
  Kicker,
  Opener,
  ornaments: { glyph: HandArrow },
});
