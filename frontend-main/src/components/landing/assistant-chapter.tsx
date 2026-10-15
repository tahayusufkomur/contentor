import { getTranslations } from "next-intl/server";
import { StoryClip } from "@/components/landing/story-clip";
import { Chapter } from "@/components/motion/chapter";
import { ASSISTANT_CLIP } from "@/lib/landing";
import { media } from "@/lib/media";

/** The first cinematic chapter: "An assistant that drafts. You approve."
 * "Describe it" producing a course outline, the review card, then Undo. Dark
 * tokens apply beneath `Chapter dark`. */
export async function AssistantChapter() {
  const t = await getTranslations("marketing.assistant");
  return (
    <Chapter
      id="assistant"
      dark
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <StoryClip
        clip={media(ASSISTANT_CLIP)}
        label={t("videoLabel")}
        steps={[t("steps.one"), t("steps.two"), t("steps.three")]}
      />
    </Chapter>
  );
}
