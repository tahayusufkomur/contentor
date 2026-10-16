import { getTranslations } from "next-intl/server";
import { SITE_STYLES } from "@shared/sections/styles";
import { LookCard } from "@/components/landing/look-card";
import { LOOK_CARDS } from "@/lib/landing";
import { media } from "@/lib/media";
import { cn } from "@/lib/utils";

/** "Who it's for": twelve kinds of coach, each beside a site in the look made
 * for her craft, drifting past in one slim row. The row is the twelve cards
 * twice over, so moving it by half loops seamlessly; the copy is hidden from
 * readers. Hover holds it; reduced motion drops the copy and lets the row
 * scroll by hand. */
export async function LooksChapter() {
  const t = await getTranslations("marketing.for");
  const cards = (copy: boolean) =>
    LOOK_CARDS.map((card) => (
      <li
        key={`${card.look}${copy ? "-copy" : ""}`}
        aria-hidden={copy || undefined}
        className={cn("shrink-0 pr-5", copy && "motion-reduce:hidden")}
      >
        <LookCard
          name={t(`niches.${card.look}`)}
          still={media(card.still)}
          render={media(card.render)}
          renderAlt={t("renderAlt", { look: SITE_STYLES[card.look].label })}
        />
      </li>
    ));
  return (
    <section
      id="for"
      aria-labelledby="for-title"
      className="scroll-mt-24 py-14 md:py-20"
    >
      <header className="mx-auto max-w-text px-6 text-center">
        <h2
          id="for-title"
          className="text-display-2 text-foreground text-balance"
        >
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-[640px] text-body-lg text-muted-foreground text-balance">
          {t("lead")}
        </p>
      </header>
      <div className="mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] motion-reduce:overflow-x-auto md:mt-12">
        <ul
          aria-label={t("galleryLabel")}
          className="flex w-max motion-reduce:pl-6 motion-safe:animate-marquee motion-safe:[animation-duration:90s] motion-safe:hover:[animation-play-state:paused]"
        >
          {cards(false)}
          {cards(true)}
        </ul>
      </div>
    </section>
  );
}
