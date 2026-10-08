import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./sprout.css";
import { BenefitsGrowth } from "./benefits";
import { ContactHello } from "./contact";
import { CourseShowcaseActivities } from "./courses";
import { CtaJoin } from "./cta";
import { EventsPlaydates } from "./events";
import { FaqAskaway } from "./faq";
import { HeroIntro, HeroPlayground } from "./hero";
import { HowItWorksSteps } from "./how-it-works";
import { MomentsSnapshots } from "./moments";
import { PhilosophyPromise } from "./philosophy";
import { PricingTickets } from "./pricing";
import { StoryHello } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_INVERSE,
  CARD,
  H1,
  H2,
  H3,
  Kicker,
  NUM,
  Opener,
  Section,
  SunDoodle,
  WRAP,
} from "./ui";

/** "sprout" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { playground: HeroPlayground, intro: HeroIntro },
  story: { hello: StoryHello },
  benefits: { growth: BenefitsGrowth },
  courseShowcase: { activities: CourseShowcaseActivities, rows: CoursesRows },
  howItWorks: { steps: HowItWorksSteps },
  philosophy: { promise: PhilosophyPromise },
  moments: { snapshots: MomentsSnapshots },
  pricing: { tickets: PricingTickets },
  faq: { askaway: FaqAskaway },
  cta: { join: CtaJoin },
  contact: { hello: ContactHello },
  events: { playdates: EventsPlaydates, rows: EventsRows },
};

/** Sprout's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "sprout",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  card: CARD,
  tones: { base: "paper", surface: "surface", inverse: "inverse" },
  Section,
  Kicker,
  Opener,
  ornaments: { glyph: SunDoodle },
});
