import { getTranslations } from "next-intl/server";
import { StoryClip } from "@/components/landing/story-clip";
import { Chapter } from "@/components/motion/chapter";
import { Reveal } from "@/components/motion/reveal";
import { SUPPORT_CLIP, SUPPORT_TILES } from "@/lib/landing";
import { media } from "@/lib/media";

/** "You're not alone", the cinematic chapter: the studio assistant drafting a
 * course from one sentence, then who else helps (founding coaches are set up
 * one on one, students come along from another platform). */
export async function SupportChapter() {
  const t = await getTranslations("marketing.support");
  return (
    <Chapter
      id="support"
      dark
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <StoryClip clip={media(SUPPORT_CLIP)} label={t("videoLabel")} />
      <Reveal
        stagger
        className="mx-auto mt-10 grid max-w-media gap-5 px-6 md:grid-cols-3"
      >
        {SUPPORT_TILES.map((key) => (
          <div key={key} className="rounded-tile bg-muted p-8">
            <h3 className="text-title-2 text-foreground">
              {t(`tiles.${key}.title`)}
            </h3>
            <p className="mt-3 text-body text-muted-foreground">
              {t(`tiles.${key}.text`)}
            </p>
          </div>
        ))}
      </Reveal>
    </Chapter>
  );
}
