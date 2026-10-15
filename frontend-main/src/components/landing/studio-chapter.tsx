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

/** "Every tool, one calm place." Seven studio tiles in a six-column bento;
 * each shows its 2x still and plays a short loop on hover, focus or tap. Loops
 * never load otherwise, which keeps them out of the scroll budget. Below
 * md the tiles are one native scroll-snap row instead of seven screens. */
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
        className="mx-auto flex max-w-[1200px] snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto px-6 [scrollbar-width:none] md:grid md:grid-cols-6 md:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {STUDIO_TILES.map((tile) => {
          const still = media(tile.still);
          const loop = media(tile.loop);
          return (
            <div
              key={tile.key}
              className={cn(
                "flex w-[80%] shrink-0 snap-start flex-col gap-4 md:w-auto",
                SPAN[tile.span],
              )}
            >
              <MediaVideo
                src={loop.src}
                webm={loop.webm}
                poster={still.src}
                posterSrcSet={
                  still.srcSmall
                    ? `${still.srcSmall} ${(still.width ?? 1600) / 2}w, ${still.src} ${still.width ?? 1600}w`
                    : undefined
                }
                posterSizes="(min-width: 768px) 50vw, 100vw"
                posterLoading="lazy"
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
