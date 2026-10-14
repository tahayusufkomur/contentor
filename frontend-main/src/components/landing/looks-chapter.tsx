import { getTranslations } from "next-intl/server";
import { SITE_STYLES } from "@shared/sections/styles";
import { LookCard } from "@/components/landing/look-card";
import { Chapter } from "@/components/motion/chapter";
import { SnapGallery } from "@/components/motion/snap-gallery";
import { LOOK_CARDS } from "@/lib/landing";
import { media } from "@/lib/media";

/** Chapter 3 (spec 5.4): "A site that looks like you." Twelve of the twenty
 * looks, one niche each, as a native scroll-snap gallery. */
export async function LooksChapter() {
  const t = await getTranslations("marketing.looks");
  return (
    <Chapter
      id="looks"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <SnapGallery
        label={t("galleryLabel")}
        items={LOOK_CARDS.map((card) => {
          const name = SITE_STYLES[card.look].label;
          return {
            key: card.look,
            node: (
              <LookCard
                name={name}
                still={media(card.still)}
                render={media(card.render)}
                renderAlt={t("renderAlt", { look: name })}
              />
            ),
          };
        })}
      />
    </Chapter>
  );
}
