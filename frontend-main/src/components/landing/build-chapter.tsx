import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { ScrollScrub } from "@/components/motion/scroll-scrub";
import {
  ScrubCaption,
  StaticScrub,
  scrubBands,
} from "@/components/landing/static-scrub";
import { BUILD_SCRUB } from "@/lib/landing";
import { media } from "@/lib/media";

/** Chapter 2 (spec 5.4): "Say what you teach. We build the rest." The setup
 * interview, the look gallery and the composer, scrubbed by scroll on desktop,
 * static on phones. */
export async function BuildChapter() {
  const t = await getTranslations("marketing.build");
  const clip = media(BUILD_SCRUB);
  const captions = [
    <ScrubCaption key="one">{t("bands.one")}</ScrubCaption>,
    <ScrubCaption key="two">{t("bands.two")}</ScrubCaption>,
    <ScrubCaption key="three">{t("bands.three")}</ScrubCaption>,
  ] as const;
  return (
    <Chapter
      id="build"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <ScrollScrub
        src={clip.src}
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        bands={scrubBands([captions[0], captions[1], captions[2]])}
        className="hidden stage:motion-safe:block"
      />
      <StaticScrub
        poster={clip.poster!}
        width={clip.width}
        height={clip.height}
        bands={[...captions]}
        className="stage:motion-safe:hidden"
      />
    </Chapter>
  );
}
