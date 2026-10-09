import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./encore.css";
import { BenefitsSetlist } from "./benefits";
import { ContactBooking } from "./contact";
import { CoursesTracklist } from "./courses";
import { CtaEncore } from "./cta";
import { EventsTourDates } from "./events";
import { FaqBSides } from "./faq";
import { HeroIntro, HeroLineup, HeroPoster } from "./hero";
import { HowItWorksSoundcheck } from "./how-it-works";
import { MomentsSleeves } from "./moments";
import { PhilosophyManifesto } from "./philosophy";
import { PricingPasses } from "./pricing";
import { StoryLinerNotes } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_ON_INK,
  DISPLAY,
  H2,
  H3,
  Kicker,
  LABEL,
  NUM,
  Opener,
  Section,
  Stars,
  WRAP,
} from "./ui";

/** "encore" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { lineup: HeroLineup, poster: HeroPoster, intro: HeroIntro },
  story: { linernotes: StoryLinerNotes },
  benefits: { setlist: BenefitsSetlist },
  courseShowcase: { tracklist: CoursesTracklist, rows: CoursesRows },
  howItWorks: { soundcheck: HowItWorksSoundcheck },
  philosophy: { manifesto: PhilosophyManifesto },
  moments: { sleeves: MomentsSleeves },
  pricing: { passes: PricingPasses },
  faq: { bsides: FaqBSides },
  cta: { encore: CtaEncore },
  contact: { booking: ContactBooking },
  events: { tourdates: EventsTourDates, rows: EventsRows },
};

/** Encore's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "encore",
  wrap: WRAP,
  display: DISPLAY,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, onInverse: BTN_ON_INK },
  tones: { base: "stock", surface: "surface", inverse: "ink" },
  Section,
  Kicker,
  Opener,
  ornaments: { glyph: Stars },
});
