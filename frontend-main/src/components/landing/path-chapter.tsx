import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { MediaVideo } from "@/components/ui/media-video";
import { PATH_STEPS } from "@/lib/landing";
import { media } from "@/lib/media";
import { cn } from "@/lib/utils";

/** "Your path to paying students": four steps, each an outcome, what makes it
 * true, and the real product doing it. Rows alternate sides from md up; the
 * live class was filmed on a phone and plays in a CSS device frame (an ink
 * slab with rounded corners, no image asset). */
export async function PathChapter() {
  const t = await getTranslations("marketing.path");
  return (
    <Chapter
      id="path"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <ol className="mx-auto grid max-w-media gap-16 px-6 md:gap-28">
        {PATH_STEPS.map((step, i) => {
          const clip = media(step.clip);
          const video = (
            <MediaVideo
              src={clip.src}
              webm={clip.webm}
              phoneSrc={clip.phoneSrc}
              // landing-media.test.ts guarantees every clip has a poster.
              poster={clip.poster!}
              width={clip.width}
              height={clip.height}
              posterLoading="lazy"
              label={t(`steps.${step.key}.videoLabel`)}
              className={step.phone ? "rounded-[34px]" : "rounded-tile"}
            />
          );
          return (
            <li
              key={step.key}
              className={cn(
                "grid items-center gap-8 md:gap-16",
                i % 2 === 1
                  ? "md:grid-cols-[3fr_2fr]"
                  : "md:grid-cols-[2fr_3fr]",
              )}
            >
              <div className={cn(i % 2 === 1 && "md:order-2")}>
                <p className="text-caption font-semibold tabular-nums text-muted-foreground">
                  0{i + 1}
                </p>
                <h3 className="mt-2 text-title text-foreground text-balance">
                  {t(`steps.${step.key}.title`)}
                </h3>
                <p className="mt-3 text-body-lg text-muted-foreground">
                  {t(`steps.${step.key}.text`)}
                </p>
                <p className="mt-5 text-caption text-muted-foreground">
                  {t(`steps.${step.key}.tools`)}
                </p>
              </div>
              {step.phone ? (
                <div className="mx-auto w-[270px] rounded-[44px] bg-foreground p-[10px]">
                  {video}
                </div>
              ) : (
                video
              )}
            </li>
          );
        })}
      </ol>
    </Chapter>
  );
}
