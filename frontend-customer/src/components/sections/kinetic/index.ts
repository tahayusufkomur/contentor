import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./kinetic.css";
import { BenefitsSpec } from "./benefits";
import { ContactBigmail } from "./contact";
import { CoursesPosters } from "./courses";
import { CtaBand } from "./cta";
import { EventsTimetable } from "./events";
import { FaqNumbered } from "./faq";
import { HeroIntro, HeroPoster } from "./hero";
import { HowItWorksTrack } from "./how-it-works";
import { MomentsMarquee } from "./moments";
import { PhilosophyStatement } from "./philosophy";
import { PricingTickets } from "./pricing";
import { StoryOutline } from "./story";
import { cn } from "@/lib/utils";
import { defineKit } from "../kit-contract";
import { BTN, DISPLAY, H2, Kicker, LABEL, Section, WRAP } from "./ui";

/** "kinetic" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { poster: HeroPoster, intro: HeroIntro },
  story: { outline: StoryOutline },
  benefits: { spec: BenefitsSpec },
  courseShowcase: { posters: CoursesPosters, rows: CoursesRows },
  howItWorks: { track: HowItWorksTrack },
  philosophy: { statement: PhilosophyStatement },
  moments: { marquee: MomentsMarquee },
  pricing: { tickets: PricingTickets },
  faq: { numbered: FaqNumbered },
  cta: { band: CtaBand },
  contact: { bigmail: ContactBigmail },
  events: { timetable: EventsTimetable, rows: EventsRows },
};

/** Kinetic's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "kinetic",
  wrap: WRAP,
  display: cn(DISPLAY, "text-[clamp(3.25rem,1rem+7vw,8rem)]"),
  h2: cn(DISPLAY, H2),
  h3: cn(DISPLAY, "text-[clamp(1.6rem,1.1rem+1.6vw,2.4rem)]"),
  label: LABEL,
  button: { primary: cn(BTN, LABEL, "items-center px-6 text-[0.8rem]") },
  tones: { base: "paper", surface: "iron", inverse: "ink" },
  Section,
  Kicker,
});
