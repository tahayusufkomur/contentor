import { getTranslations } from "next-intl/server";
import { SITE_STYLES } from "@shared/sections/styles";
import { LookCard } from "@/components/landing/look-card";
import { Chapter } from "@/components/motion/chapter";
import { SnapGallery } from "@/components/motion/snap-gallery";
import { LOOK_CARDS } from "@/lib/landing";
import { media } from "@/lib/media";

/** "Who it's for": twelve kinds of coach, each beside a site in the look made
 * for her craft, as a native scroll-snap gallery. */
export async function LooksChapter() {
  const t = await getTranslations("marketing.for");
  return (
    <Chapter
      id="for"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <SnapGallery
        label={t("galleryLabel")}
        items={LOOK_CARDS.map((card) => ({
          key: card.look,
          node: (
            <LookCard
              name={t(`niches.${card.look}`)}
              still={media(card.still)}
              render={media(card.render)}
              renderAlt={t("renderAlt", {
                look: SITE_STYLES[card.look].label,
              })}
            />
          ),
        }))}
      />
    </Chapter>
  );
}
