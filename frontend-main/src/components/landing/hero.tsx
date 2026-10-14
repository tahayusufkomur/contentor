import { getTranslations } from "next-intl/server";
import { MediaVideo } from "@/components/ui/media-video";
import { NavLink } from "@/components/ui/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { HERO_CLIP } from "@/lib/landing";
import { media } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Chapter 1 (spec 5.4): one display line, one body-lg line, the CTA pill,
 * then the four-looks cut full-bleed. Text sits above the footage on paper so
 * it needs no scrim. The text block keeps the native scroll-timeline fade
 * (`.hero-scroll-out`). The poster is an eager <img> inside MediaVideo and is
 * the page's LCP element. */
export async function Hero() {
  const t = await getTranslations("marketing.hero");
  const clip = media(HERO_CLIP);
  return (
    <section id="hero" className="scroll-mt-24 pt-16 md:pt-24">
      <div className="hero-scroll-out mx-auto max-w-text px-6 text-center">
        <h1 className="text-display text-foreground text-balance">
          {t("title")}
        </h1>
        <p className="mx-auto mt-5 max-w-[680px] text-body-lg text-muted-foreground text-balance">
          {t("lead")}
        </p>
        <NavLink
          href="/signup"
          className={cn(
            buttonVariants({ size: "lg" }),
            "mt-8 rounded-full px-7",
          )}
        >
          {t("cta")}
        </NavLink>
      </div>
      <div className="mt-12 md:mt-16 md:px-6">
        <MediaVideo
          src={clip.src}
          webm={clip.webm}
          phoneSrc={clip.phoneSrc}
          // landing-media.test.ts guarantees every clip has a poster.
          poster={clip.poster!}
          width={clip.width}
          height={clip.height}
          label={t("videoLabel")}
          className="mx-auto max-w-media md:rounded-tile"
        />
      </div>
    </section>
  );
}
