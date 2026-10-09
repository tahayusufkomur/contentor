import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./sanctum.css";
import { BenefitsGifts } from "./benefits";
import { ContactMessage } from "./contact";
import { CoursesPaths } from "./courses";
import { CtaBegin } from "./cta";
import { EventsGatherings } from "./events";
import { FaqQuestions } from "./faq";
import { HeroIntro, HeroObservatory, HeroOracle } from "./hero";
import { HowItWorksRitual } from "./how-it-works";
import { MomentsVisions } from "./moments";
import { PhilosophyInvocation } from "./philosophy";
import { PricingOfferings } from "./pricing";
import { StoryInvocation, StoryOrigin } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_LUMINOUS,
  H1,
  H2,
  H3,
  Kicker,
  LABEL,
  MoonPhases,
  NUM,
  Opener,
  Section,
  StarGlyph,
  WRAP,
} from "./ui";

/** "sanctum" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { observatory: HeroObservatory, oracle: HeroOracle, intro: HeroIntro },
  story: { invocation: StoryInvocation, origin: StoryOrigin },
  benefits: { gifts: BenefitsGifts },
  courseShowcase: { paths: CoursesPaths, rows: CoursesRows },
  howItWorks: { ritual: HowItWorksRitual },
  philosophy: { invocation: PhilosophyInvocation },
  moments: { visions: MomentsVisions },
  pricing: { offerings: PricingOfferings },
  faq: { questions: FaqQuestions },
  cta: { begin: CtaBegin },
  contact: { message: ContactMessage },
  events: { gatherings: EventsGatherings, rows: EventsRows },
};

/** Sanctum's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "sanctum",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_LUMINOUS },
  tones: { base: "temple", surface: "surface", inverse: "luminous" },
  Section,
  Kicker,
  Opener,
  ornaments: { divider: MoonPhases, glyph: StarGlyph },
});
