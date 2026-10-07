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
