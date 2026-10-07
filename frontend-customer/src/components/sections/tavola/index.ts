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
