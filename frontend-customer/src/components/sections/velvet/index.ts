import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./velvet.css";
import { BenefitsCandlelight } from "./benefits";
import { ContactNote } from "./contact";
import { CoursesPrivate } from "./courses";
import { CtaInvitation } from "./cta";
import { EventsEvenings } from "./events";
import { FaqSoft } from "./faq";
import { HeroIntro, HeroPortrait } from "./hero";
import { HowItWorksSlowly } from "./how-it-works";
import { MomentsGlimpses } from "./moments";
import { PhilosophyWhisper } from "./philosophy";
import { PricingMembership } from "./pricing";
import { StoryConfession } from "./story";
import { defineKit } from "../kit-contract";
import {
  FRAME,
  BTN,
  BTN_GHOST,
  BTN_ON_CREAM,
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

/** "velvet" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { portrait: HeroPortrait, intro: HeroIntro },
  story: { confession: StoryConfession },
  benefits: { candlelight: BenefitsCandlelight },
  courseShowcase: { private: CoursesPrivate, rows: CoursesRows },
  howItWorks: { slowly: HowItWorksSlowly },
  philosophy: { whisper: PhilosophyWhisper },
  moments: { glimpses: MomentsGlimpses },
  pricing: { membership: PricingMembership },
  faq: { soft: FaqSoft },
  cta: { invitation: CtaInvitation },
  contact: { note: ContactNote },
  events: { evenings: EventsEvenings, rows: EventsRows },
};

/** Velvet's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "velvet",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_CREAM },
  media: { frame: FRAME },
  tones: { base: "night", surface: "surface", inverse: "cream" },
  Section,
  Kicker,
  Opener,
});
