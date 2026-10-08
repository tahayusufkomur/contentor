import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import "./tavola.css";
import { BenefitsIngredients } from "./benefits";
import { ContactKitchen } from "./contact";
import { CoursesRecipeCards } from "./courses";
import { CtaReserve } from "./cta";
import { EventsTastings } from "./events";
import { FaqPantry } from "./faq";
import { HeroIntro, HeroMenu } from "./hero";
import { HowItWorksMethod } from "./how-it-works";
import { MomentsMarket } from "./moments";
import { PhilosophyHouseRule } from "./philosophy";
import { PricingMenu } from "./pricing";
import { StoryKitchenTable } from "./story";
import { defineKit } from "../kit-contract";
import {
  BTN,
  BTN_GHOST,
  BTN_ON_BOARD,
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

/** "tavola" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { menu: HeroMenu, intro: HeroIntro },
  story: { kitchentable: StoryKitchenTable },
  benefits: { ingredients: BenefitsIngredients },
  courseShowcase: { recipecards: CoursesRecipeCards, rows: CoursesRows },
  howItWorks: { method: HowItWorksMethod },
  philosophy: { houserule: PhilosophyHouseRule },
  moments: { market: MomentsMarket },
  pricing: { menu: PricingMenu },
  faq: { pantry: FaqPantry },
  cta: { reserve: CtaReserve },
  contact: { kitchen: ContactKitchen },
  events: { tastings: EventsTastings, rows: EventsRows },
};

/** Tavola's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "tavola",
  wrap: WRAP,
  display: H1,
  h2: H2,
  h3: H3,
  label: LABEL,
  num: NUM,
  button: { primary: BTN, ghost: BTN_GHOST, onInverse: BTN_ON_BOARD },
  card: CARD,
  tones: { base: "awning", surface: "cream", inverse: "board" },
  Section,
  Kicker,
  Opener,
});
