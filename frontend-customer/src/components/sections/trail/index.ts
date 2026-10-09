import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./trail.css";
import { BenefitsGearList } from "./benefits";
import { ContactBasecamp } from "./contact";
import { CoursesRoutes } from "./courses";
import { CtaLaceUp } from "./cta";
import { EventsMeetups } from "./events";
import { FaqRanger } from "./faq";
import { HeroIntro, HeroOverlook, HeroTrailhead } from "./hero";
import { HowItWorksWaypoints } from "./how-it-works";
import { MomentsPostcards } from "./moments";
import { PhilosophyTrailRule } from "./philosophy";
import { PricingPermits } from "./pricing";
import { StoryFieldNotes } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_PINE,
  CARD,
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

/** "trail" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { overlook: HeroOverlook, trailhead: HeroTrailhead, intro: HeroIntro },
  story: { fieldnotes: StoryFieldNotes },
  benefits: { gearlist: BenefitsGearList },
  courseShowcase: { routes: CoursesRoutes, rows: CoursesRows },
  howItWorks: { waypoints: HowItWorksWaypoints },
  philosophy: { trailrule: PhilosophyTrailRule },
  moments: { postcards: MomentsPostcards },
  pricing: { permits: PricingPermits },
  faq: { ranger: FaqRanger },
  cta: { laceup: CtaLaceUp },
  contact: { basecamp: ContactBasecamp },
  events: { meetups: EventsMeetups, rows: EventsRows },
};

/** Trail's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "trail",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_PINE },
  card: CARD,
  tones: { base: "stone", surface: "surface", inverse: "pine" },
  Section,
  Kicker,
  Opener,
});
