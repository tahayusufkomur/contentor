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
