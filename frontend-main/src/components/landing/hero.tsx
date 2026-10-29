import type { CSSProperties } from "react";
import { ArrowRight, Check, Sparkle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ROLE_ICONS } from "@/components/landing/role-icons";
import { buttonVariants } from "@/components/ui/button";
import { LocaleNavLink } from "@/i18n/navigation";
import { HERO_PHOTO, TEAM_ROLES } from "@/lib/landing";
import { media } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Where each role's card sits around the creator from lg up. The path's
 * order zigzags left, right, left… so each turn crosses the centre. */
const PLACE = [
  "lg:col-start-1 lg:row-start-1",
  "lg:col-start-3 lg:row-start-1",
  "lg:col-start-1 lg:row-start-2",
  "lg:col-start-3 lg:row-start-2",
  "lg:col-start-1 lg:row-start-3",
  "lg:col-start-3 lg:row-start-3",
];

/** From each card's inner edge to the photo, in the hub's 976 × 428 box.
 * The photo spans all three rows, so every wire meets it level. */
const WIRES = [
  "M300 62 L323 62",
  "M676 62 L653 62",
  "M300 214 L323 214",
  "M676 214 L653 214",
  "M300 366 L323 366",
  "M676 366 L653 366",
];

const TRUST = ["trial", "cancel", "time"] as const;

/** The promise, then the creator with her whole team around her: six roles
 * that take turns at work (CSS only, globals.css .team-turn; reduced motion
 * keeps every card still). Each card links to its role in the team chapter. */
export async function Hero() {
  const [t, tr] = await Promise.all([
    getTranslations("marketing.hero"),
    getTranslations("marketing.team.roles"),
  ]);
  const photo = media(HERO_PHOTO);
  return (
    <section id="hero" className="scroll-mt-24 pb-4 pt-10 md:pt-14">
      <div className="hero-scroll-out mx-auto max-w-text px-6 text-center">
        <a
          href="#founding"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pl-3 pr-3.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
        >
          <Sparkle aria-hidden className="size-3.5 text-marketing-accent" />
          <span className="text-balance">
            {t.rich("pill", {
              b: (chunks) => (
                <b className="font-medium text-foreground">{chunks}</b>
              ),
            })}
          </span>
          <ArrowRight aria-hidden className="size-3.5" />
        </a>
        <h1 className="mt-6 text-display text-foreground text-balance">
          {t.rich("title", {
            accent: (chunks) => (
              <span className="block text-marketing-accent">{chunks}</span>
            ),
          })}
        </h1>
        <p className="mx-auto mt-5 max-w-[680px] text-body-lg text-muted-foreground text-balance">
          {t("lead")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LocaleNavLink
            href="/signup"
            className={cn(buttonVariants({ size: "lg" }), "rounded-full px-7")}
          >
            {t("cta")}
          </LocaleNavLink>
          <a
            href="#team"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "rounded-full px-7",
            )}
          >
            {t("secondary")}
          </a>
        </div>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-caption text-muted-foreground">
          {TRUST.map((key) => (
            <li key={key} className="flex items-center gap-1.5">
              <Check aria-hidden className="size-3.5 text-marketing-accent" />
              {t(`trust.${key}`)}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mx-auto mt-12 grid max-w-[640px] grid-cols-2 gap-2.5 px-6 sm:gap-3 lg:mt-14 lg:w-[976px] lg:max-w-none lg:grid-cols-[300px_1fr_300px] lg:grid-rows-[124px_124px_124px] lg:gap-x-0 lg:gap-y-7 lg:px-0">
        <svg
          aria-hidden
          viewBox="0 0 976 428"
          className="pointer-events-none absolute inset-0 hidden size-full lg:block"
        >
          {WIRES.map((d, i) => (
            <path
              key={d}
              d={d}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="4 6"
              className="team-wire [stroke:var(--border)]"
              style={{ "--i": i } as CSSProperties}
            />
          ))}
        </svg>
        <figure className="relative col-span-2 mx-auto mb-3 h-[312px] w-[250px] overflow-hidden rounded-[22px] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.45)] ring-1 ring-border lg:col-span-1 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mb-0 lg:h-[412px] lg:w-[330px] lg:self-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- sized AVIF with its own srcSet */}
          <img
            src={photo.src}
            srcSet={`${photo.srcSmall} ${photo.width / 2}w, ${photo.src} ${photo.width}w`}
            sizes="(min-width: 1024px) 330px, 250px"
            alt=""
            width={photo.width}
            height={photo.height}
            decoding="async"
            className="size-full bg-muted object-cover object-[56%_30%]"
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-10 text-center text-white">
            <span className="block text-[15px] font-semibold">{t("you")}</span>
            <span className="block text-xs opacity-80">{t("youText")}</span>
          </figcaption>
        </figure>
        {TEAM_ROLES.map(({ key }, i) => {
          const Icon = ROLE_ICONS[key];
          return (
            <a
              key={key}
              href={`#team-${key}`}
              style={{ "--i": i } as CSSProperties}
              className={cn(
                "team-turn group grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2.5 rounded-[18px] border border-border bg-card p-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marketing-accent lg:grid-cols-[42px_minmax(0,1fr)_auto] lg:gap-3 lg:px-3.5",
                PLACE[i],
              )}
            >
              <span className="team-icon grid size-9 place-items-center rounded-xl bg-muted text-foreground lg:size-[42px]">
                <Icon aria-hidden className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground transition-colors group-hover:text-marketing-accent lg:text-[15px]">
                  {tr(`${key}.name`)}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground lg:text-[12.5px]">
                  {t(`roles.${key}`)}
                </span>
              </span>
              <span aria-hidden className="hidden text-[11.5px] lg:grid">
                <span className="team-done col-start-1 row-start-1 flex items-center gap-1 font-medium text-[var(--success)]">
                  <Check className="size-3" />
                  {t("done")}
                </span>
                <span className="team-on col-start-1 row-start-1 flex items-center gap-1.5 font-medium text-marketing-accent opacity-0">
                  <span className="size-1.5 rounded-full bg-marketing-accent" />
                  {t("onIt")}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
