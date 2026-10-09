import "./pop.css";
import type { StyleSections } from "../types";
import { CoursesRows, EventsRows } from "../rows";
import { BenefitsBento } from "./benefits";
import { ContactPostcard } from "./contact";
import { CoursesCards } from "./courses";
import { CtaMarquee } from "./cta";
import { EventsTickets } from "./events";
import { FaqBubbles } from "./faq";
import { HeroBigname, HeroCluster, HeroIntro } from "./hero";
import { HowItWorksCircles } from "./how-it-works";
import { MomentsPolaroids } from "./moments";
import { PhilosophyHighlight } from "./philosophy";
import { PricingColorcards } from "./pricing";
import { StorySticker } from "./story";
import { defineKit } from "../kit-contract";
import { Kicker, Section, WRAP } from "./ui";

/** "pop" style layouts: family → variant → component. */
export const sections: Partial<StyleSections> = {
  hero: { cluster: HeroCluster, bigname: HeroBigname, intro: HeroIntro },
  story: { sticker: StorySticker },
  benefits: { bento: BenefitsBento },
  courseShowcase: { cards: CoursesCards, rows: CoursesRows },
  howItWorks: { circles: HowItWorksCircles },
  philosophy: { highlight: PhilosophyHighlight },
  moments: { polaroids: MomentsPolaroids },
  pricing: { colorcards: PricingColorcards },
  faq: { bubbles: FaqBubbles },
  cta: { marquee: CtaMarquee },
  contact: { postcard: ContactPostcard },
  events: { tickets: EventsTickets, rows: EventsRows },
};

/** Pop's StyleKit: what AI-built sections (components/cx) render with. */
export const kit = defineKit({
  id: "pop",
  wrap: WRAP,
  display: "pop-display pop-h1",
  h2: "pop-display pop-h2",
  h3: "pop-h3",
  label: "pop-mono",
  button: {
    primary: "pop-btn pop-btn-primary",
    ghost: "pop-btn pop-btn-paper",
    onInverse: "pop-btn pop-btn-paper",
  },
  card: "pop-card p-6 md:p-8",
  tones: { base: "paper", surface: "lilac", inverse: "plum" },
  Section,
  Kicker,
});
