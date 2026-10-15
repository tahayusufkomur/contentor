import { getTranslations } from "next-intl/server";
import { StoryClip } from "@/components/landing/story-clip";
import { Chapter } from "@/components/motion/chapter";
import { BUILD_CLIP } from "@/lib/landing";
import { media } from "@/lib/media";

/** "Say what you teach. We build the rest." The setup interview, the look
 * gallery and the composer as one clip, its three steps beneath. */
export async function BuildChapter() {
  const t = await getTranslations("marketing.build");
  return (
    <Chapter
      id="build"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <StoryClip
        clip={media(BUILD_CLIP)}
        label={t("videoLabel")}
        steps={[t("steps.one"), t("steps.two"), t("steps.three")]}
      />
    </Chapter>
  );
}
