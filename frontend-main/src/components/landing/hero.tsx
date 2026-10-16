import { getTranslations } from "next-intl/server";
import { NavLink } from "@/components/ui/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { HERO_CHIPS, HERO_PHOTO } from "@/lib/landing";
import { media, type MediaItem } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Where each real screen sits over the photograph from md up: the people
 * are on the left, the calm wall on the right. */
const CHIP_PLACE: Record<(typeof HERO_CHIPS)[number], string> = {
  "chip-post": "right-[4%] top-[7%] w-[34%]",
  "chip-live": "right-[9%] top-[37%] w-[22%]",
  "chip-sale": "right-[4%] bottom-[7%] w-[38%]",
};

const srcSet = (m: MediaItem) =>
  m.srcSmall
    ? `${m.srcSmall} ${m.width / 2}w, ${m.src} ${m.width}w`
    : undefined;

/** One real screen from the coach's studio, cut out as a card. */
function Chip({
  id,
  className,
}: {
  id: (typeof HERO_CHIPS)[number];
  className?: string;
}) {
  const m = media(id);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- sized AVIF with its own srcSet
    <img
      src={m.src}
      srcSet={srcSet(m)}
      sizes="(min-width: 768px) 38vw, 100vw"
      alt={m.alt ?? ""}
      width={m.width}
      height={m.height}
      decoding="async"
      className={cn(
        "rounded-[14px] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] ring-1 ring-black/5",
        className,
      )}
    />
  );
}

/** The promise, then a coach at work with three real screens from her studio
 * over the photograph: a student's post, her live class, her latest sales.
 * The photograph is the page's LCP element (eager, high priority). */
export async function Hero() {
  const t = await getTranslations("marketing.hero");
  const photo = media(HERO_PHOTO);
  return (
    <section id="hero" className="scroll-mt-24 pt-12 md:pt-16">
      <div className="hero-scroll-out mx-auto max-w-text px-6 text-center">
        <h1 className="text-display text-foreground text-balance">
          {t("title")}
        </h1>
        <p className="mx-auto mt-5 max-w-[680px] text-body-lg text-muted-foreground text-balance">
          {t("lead")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <NavLink
            href="/signup"
            className={cn(buttonVariants({ size: "lg" }), "rounded-full px-7")}
          >
            {t("cta")}
          </NavLink>
          <a
            href="#path"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "rounded-full px-7",
            )}
          >
            {t("secondary")}
          </a>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-media md:mt-12 md:px-6">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF with its own srcSet */}
          <img
            src={photo.src}
            srcSet={srcSet(photo)}
            sizes="(min-width: 1440px) 1392px, 100vw"
            alt={photo.alt ?? ""}
            width={photo.width}
            height={photo.height}
            fetchPriority="high"
            decoding="async"
            className="w-full bg-muted md:rounded-tile"
          />
          {HERO_CHIPS.map((id) => (
            <Chip
              key={id}
              id={id}
              className={cn("absolute hidden md:block", CHIP_PLACE[id])}
            />
          ))}
        </div>
        {/* Phones: the post and the class; the sales table is too fine to read at this width. */}
        <div className="mt-4 grid gap-3 px-6 md:hidden">
          {HERO_CHIPS.filter((id) => id !== "chip-sale").map((id) => (
            <Chip key={id} id={id} className="w-full" />
          ))}
        </div>
      </div>
    </section>
  );
}
