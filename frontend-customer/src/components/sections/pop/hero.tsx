import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { TILE_ASPECT, heroPhotos, tileStyle } from "../collage";
import { Kicker, PopButton, PopSection, RingBadge, WRAP, str } from "./ui";

/** Where the first two stickers sit on a phone: the first photo big (the
 *  photograph carries the screen), the second a small sticker over its
 *  corner. The other two wait for sm, where `tileStyle` places all four (the
 *  editor shows them along the foot so each photo can be picked). */
const PHONE_TILES = [
  { left: "3%", top: "0%", width: "84%" },
  { left: "62%", top: "50%", width: "36%" },
  { left: "4%", top: "64%", width: "28%" },
  { left: "68%", top: "72%", width: "26%" },
];

/** Cluster hero: up to four photos pasted over each other like stickers on a
 *  notebook, the headline slapped across them on a lime strip, the `meta`
 *  line on the spinning badge. */
export function HeroCluster({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const meta = str(block.meta);
  const photos = heroPhotos(block, editable);
  return (
    <PopSection
      bg="var(--background)"
      className="pop-top pb-20 pt-10 md:pb-28 md:pt-14"
    >
      <div className={cn(WRAP, "text-center")}>
        <div className="flex justify-center">
          <Kicker block={block} editable={editable} />
        </div>
        <div
          className={cn(
            "relative mx-auto mt-8 grid w-full max-w-[72rem]",
            photos.length > 0 &&
              "aspect-[5/6] sm:aspect-[3/2] md:aspect-[2/1] lg:max-w-[64rem]",
          )}
        >
          {photos.length > 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-x-[6%] inset-y-[12%] -rotate-1 rounded-[3rem] border-2 border-[color:var(--pop-ink)] bg-[var(--primary)]"
            />
          )}
          {photos.map((value, n) => {
            const { left, top, transform, ...rest } = tileStyle(
              photos.length,
              n,
            );
            const phone = PHONE_TILES[n];
            return (
              <div
                key={n}
                className={cn(
                  "absolute left-[var(--pl)] top-[var(--pt)] w-[var(--pw)] sm:left-[var(--l)] sm:top-[var(--t)] sm:w-[var(--tw)]",
                  !editable && n > 1 && "hidden sm:block",
                )}
                style={
                  {
                    ...rest,
                    transform,
                    "--l": left,
                    "--t": top,
                    "--pl": phone?.left,
                    "--pt": phone?.top,
                    "--pw": phone?.width,
                    zIndex: 1 + (n % 2),
                  } as CSSProperties
                }
              >
                <Img
                  value={value}
                  alt={alt}
                  priority={n === 0}
                  className={cn(
                    TILE_ASPECT[n % 2],
                    "w-full rounded-[var(--pop-r)] border-2 border-[color:var(--pop-ink)] shadow-[6px_6px_0_var(--pop-ink)]",
                  )}
                />
              </div>
            );
          })}
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            placeholder="Headline"
            className={cn(
              "pop-display relative z-10 inline-block max-w-[88%] -rotate-2 self-end justify-self-center border-2 border-[color:var(--pop-ink)] bg-[var(--accent)] px-5 py-2 shadow-[8px_8px_0_var(--pop-ink)] sm:self-center md:px-8 md:py-4",
              alt.length > 36
                ? "text-[clamp(1.9rem,0.8rem+3.6vw,4.4rem)]"
                : "text-[clamp(2.6rem,0.8rem+5vw,6.8rem)]",
            )}
          />
          {meta && (
            <RingBadge
              text={meta}
              uid={String(block.id ?? "hero")}
              className="absolute right-0 top-2 z-20 w-24 sm:-bottom-8 sm:top-auto sm:w-36 lg:-right-4 lg:w-40"
            />
          )}
        </div>
        <Txt
          block={block}
          field="subhead"
          editable={editable}
          as="p"
          className="pop-lede mx-auto mt-12 max-w-[36rem] text-muted-foreground"
        />
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <PopButton
            block={block}
            editable={editable}
            label="ctaLabel"
            href="ctaHref"
          />
          <div className={editable ? "contents" : "hidden sm:contents"}>
            <PopButton
              block={block}
              editable={editable}
              label="secondaryLabel"
              href="secondaryHref"
              tone="paper"
            />
          </div>
        </div>
        {editable && (
          <Txt
            block={block}
            field="meta"
            editable={editable}
            as="p"
            className="pop-mono mt-6 text-sm text-muted-foreground"
            placeholder="Small line (shown on the badge)"
          />
        )}
      </div>
    </PopSection>
  );
}

/** Poster hero: a giant headline that ends in an inline photo, a tilted
 *  portrait on a berry colour block, and the `meta` line on a spinning badge. */
export function HeroBigname({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const meta = str(block.meta);
  return (
    <PopSection
      bg="var(--background)"
      className="pop-top pb-20 pt-10 md:pb-28 md:pt-16"
    >
      <div
        className={cn(
          WRAP,
          "grid items-center gap-x-12 gap-y-16 lg:grid-cols-12",
        )}
      >
        <div className="lg:col-span-7">
          <Kicker block={block} editable={editable} />
          <div
            className={cn(
              "pop-display mt-6 md:mt-8",
              alt.length > 28
                ? "pop-h1"
                : "text-[clamp(3.5rem,1rem+8vw,9.5rem)]",
            )}
          >
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              className="inline"
              placeholder="Headline"
            />
            {imageUrl(block.image2) && (
              <Img value={block.image2} className="pop-inline-photo" />
            )}
          </div>
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            className="pop-lede mt-7 max-w-[34rem] text-muted-foreground md:mt-9"
          />
          <div className="mt-9 flex flex-wrap gap-4">
            <PopButton
              block={block}
              editable={editable}
              label="ctaLabel"
              href="ctaHref"
            />
            <PopButton
              block={block}
              editable={editable}
              label="secondaryLabel"
              href="secondaryHref"
              tone="paper"
            />
          </div>
          {editable && (
            <Txt
              block={block}
              field="meta"
              editable={editable}
              as="p"
              className="pop-mono mt-6 text-sm text-muted-foreground"
              placeholder="Small line (shown on the badge)"
            />
          )}
        </div>

        <div className="relative mx-auto w-full max-w-[26rem] pb-6 pr-4 lg:col-span-5 lg:max-w-none lg:pl-6">
          <div
            aria-hidden="true"
            className="absolute inset-0 bottom-6 right-4 translate-x-4 translate-y-5 rotate-[4deg] rounded-[var(--pop-r)] border-2 border-[color:var(--pop-ink)] bg-[var(--primary)] lg:left-6"
          />
          <div className="relative -rotate-2 overflow-hidden rounded-[var(--pop-r)] border-2 border-[color:var(--pop-ink)]">
            <Img
              value={block.image}
              alt={alt}
              priority
              className="aspect-[4/5] w-full"
            />
          </div>
          {meta && (
            <RingBadge
              text={meta}
              uid={String(block.id ?? "hero")}
              className="absolute -bottom-6 -left-3 w-32 sm:w-40 lg:-left-8 lg:w-44"
            />
          )}
        </div>
      </div>
    </PopSection>
  );
}

/** Compact page-title band for inner pages. */
export function HeroIntro({ block, editable }: SectionProps) {
  const alt = str(block.headline);
  const withImage = Boolean(imageUrl(block.image));
  return (
    <PopSection
      bg="var(--background)"
      className="pop-top pb-14 pt-12 md:pb-20 md:pt-20"
    >
      <div
        className={cn(
          WRAP,
          "grid items-end gap-x-12 gap-y-10",
          withImage && "md:grid-cols-12",
        )}
      >
        <div className={cn(withImage ? "md:col-span-8" : "max-w-5xl")}>
          <Kicker block={block} editable={editable} fill="pink" />
          <Txt
            block={block}
            field="headline"
            editable={editable}
            as="h1"
            className="pop-display mt-6 text-[clamp(2.75rem,1.2rem+4.6vw,6rem)]"
            placeholder="Page title"
          />
          <Txt
            block={block}
            field="subhead"
            editable={editable}
            as="p"
            className="pop-lede mt-6 max-w-[38rem] text-muted-foreground"
          />
          {has(block, "ctaLabel", editable) && (
            <div className="mt-8 flex flex-wrap gap-4">
              <PopButton
                block={block}
                editable={editable}
                label="ctaLabel"
                href="ctaHref"
              />
            </div>
          )}
        </div>
        {withImage && (
          <div className="relative w-44 justify-self-start sm:w-56 md:col-span-4 md:justify-self-end">
            <div
              aria-hidden="true"
              className="absolute inset-0 translate-x-3 translate-y-3 rounded-full border-2 border-[color:var(--pop-ink)] bg-[var(--accent)]"
            />
            <Img
              value={block.image}
              alt={alt}
              priority
              className="aspect-square w-full rounded-full border-2 border-[color:var(--pop-ink)]"
            />
          </div>
        )}
      </div>
    </PopSection>
  );
}
