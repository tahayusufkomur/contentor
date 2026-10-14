import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { Reveal } from "@/components/motion/reveal";
import { MediaVideo } from "@/components/ui/media-video";
import { STUDIO_TILES } from "@/lib/landing";
import { media } from "@/lib/media";
import { cn } from "@/lib/utils";

// Literal classes so Tailwind emits them.
const SPAN: Record<2 | 3 | 4, string> = {
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};

/** Chapter 4 (spec 5.4): "Every tool, one calm place." Seven studio tiles in a
 * six-column bento; each shows its 2x still and plays a short loop on hover,
 * focus or tap. Loops never load otherwise, which keeps them out of the
 * scroll budget. */
export async function StudioChapter() {
  const t = await getTranslations("marketing.studio");
  return (
    <Chapter
      id="studio"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <Reveal
        stagger
        className="mx-auto grid max-w-media gap-5 px-6 md:grid-cols-6"
      >
        {STUDIO_TILES.map((tile) => {
          const still = media(tile.still);
          const loop = media(tile.loop);
          return (
            <div
              key={tile.key}
              className={cn("flex flex-col gap-4", SPAN[tile.span])}
            >
              <MediaVideo
                src={loop.src}
                webm={loop.webm}
                poster={still.src}
                width={loop.width}
                height={loop.height}
                playOn="hover"
                showToggle={false}
                label={t(`tiles.${tile.key}.title`)}
                className="rounded-tile"
              />
              <div>
                <h3 className="text-title-2 text-foreground">
                  {t(`tiles.${tile.key}.title`)}
                </h3>
                <p className="mt-1.5 text-body text-muted-foreground">
                  {t(`tiles.${tile.key}.text`)}
                </p>
              </div>
            </div>
          );
        })}
      </Reveal>
    </Chapter>
  );
}
