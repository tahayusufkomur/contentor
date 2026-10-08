import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./terminal.css";
import { BenefitsFeatures } from "./benefits";
import { ContactIssue } from "./contact";
import { CoursesModules } from "./courses";
import { CtaInstall } from "./cta";
import { EventsCron } from "./events";
import { FaqMan } from "./faq";
import { HeroIntro, HeroPrompt } from "./hero";
import { HowItWorksPipeline } from "./how-it-works";
import { MomentsScreens } from "./moments";
import { PhilosophyPrinciples } from "./philosophy";
import { PricingPlans } from "./pricing";
import { StoryReadme } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_INVERSE,
  Cursor,
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

/** "terminal" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { prompt: HeroPrompt, intro: HeroIntro },
  story: { readme: StoryReadme },
  benefits: { features: BenefitsFeatures },
  courseShowcase: { modules: CoursesModules, rows: CoursesRows },
  howItWorks: { pipeline: HowItWorksPipeline },
  philosophy: { principles: PhilosophyPrinciples },
  moments: { screens: MomentsScreens },
  pricing: { plans: PricingPlans },
  faq: { man: FaqMan },
  cta: { install: CtaInstall },
  contact: { issue: ContactIssue },
  events: { cron: EventsCron, rows: EventsRows },
};

/** Terminal's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "terminal",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  tones: { base: "console", surface: "surface", inverse: "inverse" },
  Section,
  Kicker,
  Opener,
  ornaments: { glyph: Cursor },
});
