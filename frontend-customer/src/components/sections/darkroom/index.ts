import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./darkroom.css";
import { BenefitsCatalogue } from "./benefits";
import { ContactHours } from "./contact";
import { CoursesPlates } from "./courses";
import { CtaPrivateView } from "./cta";
import { EventsOpenings } from "./events";
import { FaqDidactics } from "./faq";
import { HeroExhibition, HeroIntro } from "./hero";
import { HowItWorksContactSheet } from "./how-it-works";
import { MomentsGrid } from "./moments";
import { PhilosophyWallText } from "./philosophy";
import { PricingEditions } from "./pricing";
import { StoryStatement } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_ON_BLACK,
  Dot,
  H1,
  H2,
  H3,
  Kicker,
  LABEL,
  LINK,
  Opener,
  Section,
  WRAP,
} from "./ui";

/** "darkroom" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { exhibition: HeroExhibition, intro: HeroIntro },
  story: { statement: StoryStatement },
  benefits: { catalogue: BenefitsCatalogue },
  courseShowcase: { plates: CoursesPlates, rows: CoursesRows },
  howItWorks: { contactsheet: HowItWorksContactSheet },
  philosophy: { walltext: PhilosophyWallText },
  moments: { grid: MomentsGrid },
  pricing: { editions: PricingEditions },
  faq: { didactics: FaqDidactics },
  cta: { privateview: CtaPrivateView },
  contact: { hours: ContactHours },
  events: { openings: EventsOpenings, rows: EventsRows },
};

/** Darkroom's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "darkroom",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  button: { primary: BTN, ghost: LINK, onInverse: BTN_ON_BLACK },
  tones: { base: "wall", surface: "surface", inverse: "black" },
  Section,
  Kicker,
  Opener,
  ornaments: { glyph: Dot },
});
