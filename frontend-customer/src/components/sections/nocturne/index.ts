import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./nocturne.css";
import { BenefitsRituals } from "./benefits";
import { ContactNote } from "./contact";
import { CoursesNights } from "./courses";
import { CtaLamp } from "./cta";
import { EventsEvenings } from "./events";
import { FaqSoft } from "./faq";
import { HeroIntro, HeroLantern } from "./hero";
import { HowItWorksWindDown } from "./how-it-works";
import { MomentsLanterns } from "./moments";
import { PhilosophyWhisper } from "./philosophy";
import { PricingStays } from "./pricing";
import { StoryEvening } from "./story";
import { defineKit } from "../kit-contract";
import {
  ARCH,
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

/** "nocturne" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { lantern: HeroLantern, intro: HeroIntro },
  story: { evening: StoryEvening },
  benefits: { rituals: BenefitsRituals },
  courseShowcase: { nights: CoursesNights, rows: CoursesRows },
  howItWorks: { winddown: HowItWorksWindDown },
  philosophy: { whisper: PhilosophyWhisper },
  moments: { lanterns: MomentsLanterns },
  pricing: { stays: PricingStays },
  faq: { soft: FaqSoft },
  cta: { lamp: CtaLamp },
  contact: { note: ContactNote },
  events: { evenings: EventsEvenings, rows: EventsRows },
};

/** Nocturne's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "nocturne",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_CREAM },
  media: { arch: ARCH },
  tones: { base: "night", surface: "surface", inverse: "cream" },
  Section,
  Kicker,
  Opener,
});
