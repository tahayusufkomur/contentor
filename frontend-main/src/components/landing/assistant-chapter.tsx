import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { ScrollScrub } from "@/components/motion/scroll-scrub";
import { ScrubCaption, StaticScrub, scrubBands } from "@/components/landing/static-scrub";
import { ASSISTANT_SCRUB } from "@/lib/landing";
import { media } from "@/lib/media";

/** Chapter 5 (spec 5.4), the first cinematic chapter: "An assistant that
 * drafts. You approve." "Describe it" producing a course outline, the review
 * card, then Undo. Dark tokens apply beneath `Chapter dark`; the caption pill
 * flips with them (ink pill, paper text) and still reads over the footage. */
export async function AssistantChapter() {
  const t = await getTranslations("marketing.assistant");
  const clip = media(ASSISTANT_SCRUB);
  const captions = [
    <ScrubCaption key="one">{t("bands.one")}</ScrubCaption>,
    <ScrubCaption key="two">{t("bands.two")}</ScrubCaption>,
    <ScrubCaption key="three">{t("bands.three")}</ScrubCaption>,
  ] as const;
  return (
    <Chapter id="assistant" dark eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")}>
      <ScrollScrub
        src={clip.src}
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        bands={scrubBands([captions[0], captions[1], captions[2]])}
        className="hidden md:block"
      />
      <StaticScrub
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        bands={[...captions]}
        className="md:hidden"
      />
    </Chapter>
  );
}
