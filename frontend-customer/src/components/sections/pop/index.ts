import "./pop.css";
import type { StyleSections } from "../types";
import { BenefitsBento } from "./benefits";
import { ContactPostcard } from "./contact";
import { CoursesCards } from "./courses";
import { CtaMarquee } from "./cta";
import { EventsTickets } from "./events";
import { FaqBubbles } from "./faq";
import { HeroBigname, HeroIntro } from "./hero";
import { HowItWorksCircles } from "./how-it-works";
import { MomentsPolaroids } from "./moments";
import { PhilosophyHighlight } from "./philosophy";
import { PricingColorcards } from "./pricing";
import { StorySticker } from "./story";

/** "pop" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { bigname: HeroBigname, intro: HeroIntro },
  story: { sticker: StorySticker },
  benefits: { bento: BenefitsBento },
  courseShowcase: { cards: CoursesCards },
  howItWorks: { circles: HowItWorksCircles },
  philosophy: { highlight: PhilosophyHighlight },
  moments: { polaroids: MomentsPolaroids },
  pricing: { colorcards: PricingColorcards },
  faq: { bubbles: FaqBubbles },
  cta: { marquee: CtaMarquee },
  contact: { postcard: ContactPostcard },
  events: { tickets: EventsTickets },
};
