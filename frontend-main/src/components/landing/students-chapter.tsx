import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { Reveal } from "@/components/motion/reveal";
import { MediaVideo } from "@/components/ui/media-video";
import { STUDENT_CLIP, STUDENT_TILES } from "@/lib/landing";
import { media } from "@/lib/media";

/** Chapter 6 (spec 5.4): "Your students, on every screen." Real phone
 * footage inside a CSS device frame (an ink slab with rounded corners, no
 * image asset) beside the student dashboard and a live class as stills. */
export async function StudentsChapter() {
  const t = await getTranslations("marketing.students");
  const clip = media(STUDENT_CLIP);
  return (
    <Chapter
      id="students"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <div className="mx-auto grid max-w-media items-center gap-10 px-6 md:grid-cols-[320px_1fr] md:gap-16">
        <Reveal direction="up" duration={0.7}>
          <div className="mx-auto w-[270px] rounded-[44px] bg-foreground p-[10px]">
            <MediaVideo
              src={clip.src}
              webm={clip.webm}
              phoneSrc={clip.phoneSrc}
              poster={clip.poster!}
              width={clip.width}
              height={clip.height}
              label={t("phoneLabel")}
              className="rounded-[34px]"
            />
          </div>
        </Reveal>
        <Reveal stagger className="grid gap-5">
          {STUDENT_TILES.map((tile) => {
            const still = media(tile.still);
            return (
              <figure
                key={tile.key}
                className="rounded-tile bg-muted p-5 md:p-6"
              >
                <img
                  src={still.src}
                  alt={still.alt ?? ""}
                  width={still.width}
                  height={still.height}
                  loading="lazy"
                  decoding="async"
                  className="w-full rounded-[12px] bg-background"
                />
                <figcaption className="mt-5">
                  <h3 className="text-title-2 text-foreground">
                    {t(`tiles.${tile.key}.title`)}
                  </h3>
                  <p className="mt-1.5 text-body text-muted-foreground">
                    {t(`tiles.${tile.key}.text`)}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </Reveal>
      </div>
    </Chapter>
  );
}
