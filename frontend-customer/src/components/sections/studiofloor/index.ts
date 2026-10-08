import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./studiofloor.css";
import { BenefitsMoves } from "./benefits";
import { ContactBooking } from "./contact";
import { CourseShowcaseSetlist } from "./courses";
import { CtaSpotlight } from "./cta";
import { EventsSchedule } from "./events";
import { FaqWarmup } from "./faq";
import { HeroIntro, HeroStage } from "./hero";
import { HowItWorksRehearsal } from "./how-it-works";
import { MomentsReel } from "./moments";
import { PhilosophyMirror } from "./philosophy";
import { PricingPasses } from "./pricing";
import { StoryBackstage } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_INVERSE,
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

/** "studiofloor" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { stage: HeroStage, intro: HeroIntro },
  story: { backstage: StoryBackstage },
  benefits: { moves: BenefitsMoves },
  courseShowcase: { setlist: CourseShowcaseSetlist, rows: CoursesRows },
  howItWorks: { rehearsal: HowItWorksRehearsal },
  philosophy: { mirror: PhilosophyMirror },
  moments: { reel: MomentsReel },
  pricing: { passes: PricingPasses },
  faq: { warmup: FaqWarmup },
  cta: { spotlight: CtaSpotlight },
  contact: { booking: ContactBooking },
  events: { schedule: EventsSchedule, rows: EventsRows },
};

/** Studio Floor's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "studiofloor",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_INVERSE },
  tones: { base: "stage", surface: "surface", inverse: "spotlight" },
  Section,
  Kicker,
  Opener,
});
