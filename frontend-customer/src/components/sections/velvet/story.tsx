import { makeStoryPull } from "../story-layouts";
import { Arrow, FRAME, H2, Kicker, Section, WRAP } from "./ui";

/** A confession: the heading set as one large italic line, the story in two
 *  columns beside a small portrait behind its fine line, signed in italics. */
export const StoryConfession = makeStoryPull({
  Section: (p) => <Section tone="surface" {...p} />,
  wrap: WRAP,
  h2: H2,
  Kicker,
  body: "text-[1.0625rem] leading-[1.85] text-muted-foreground [&_p]:mb-5",
  signature: "velvet-it font-display text-[1.6rem] leading-none text-primary",
  link: "velvet-link text-[0.78rem] font-medium uppercase tracking-[0.22em]",
  LinkIcon: Arrow,
  photo: FRAME,
});
