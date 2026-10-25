import type { CSSProperties, ReactNode } from "react";
import { LookFonts } from "@/components/covers/look-fonts";
import { parseLook } from "@/lib/covers/palette";
import {
  focus,
  hookParts,
  hookScale,
  inkOn,
  plainHook,
  wordsOnTop,
} from "@/lib/reels/cover";
import { cn } from "@/lib/utils";
import type { CoverBrand, CoverDesign, ReelCoverCard } from "@/types/reels";

export const COVER_DESIGNS: CoverDesign[] = [
  "editorial",
  "bold",
  "poster",
  "series",
];
const ANTON = "https://fonts.googleapis.com/css2?family=Anton&display=swap";
const BOLD_FACE = "'Anton', Impact, 'Arial Narrow', sans-serif";
// Clear of what the apps draw over a reel (on 1080 px: their header, buttons and caption), in container units.
const TOP = "20cqw";
const BOTTOM = "38cqw";
const SIDE = "7.5cqw";
const RIGHT = "15cqw";
const HEIGHT = 1600 / 9; // a 9:16 cover's height, in cqw

/** The fonts covers are drawn in: the look's, and the bold design's own. */
export function CoverFonts({ look }: { look: string }) {
  return (
    <>
      <LookFonts look={look} />
      <link rel="stylesheet" href={ANTON} />
    </>
  );
}

/** A reel's cover, its first second: the hook (its *word* lit) over a frame of the coach's video, in one of
 *  four designs, in her look. Sized in container units, so the same cover is the 1080 px picture the browser
 *  sidecar takes (/render/reel/<token>/cover), the editor's preview and the idea cards. Its words keep clear
 *  of the apps' own buttons and caption, and of her face. */
export function ReelCover({
  cover,
  brand,
  className,
}: {
  cover: ReelCoverCard;
  brand: CoverBrand;
  className?: string;
}) {
  const { style } = parseLook(brand.look);
  const display = `'${style.fonts.display}', Georgia, serif`;
  const body = `'${style.fonts.body}', system-ui, sans-serif`;
  const colors = brand.colors;
  const lit = brand.highlight || colors.accent || "#FFD43B";
  const scale = hookScale(cover.title);
  const top = wordsOnTop(cover.face);
  const at: CSSProperties = top
    ? { top: TOP, left: SIDE, right: SIDE }
    : { bottom: BOTTOM, left: SIDE, right: RIGHT };

  const hook = (litStyle: CSSProperties) =>
    hookParts(cover.title).map((part, i) =>
      part.lit ? (
        <span key={i} style={litStyle}>
          {part.text}
        </span>
      ) : (
        <span key={i}>{part.text}</span>
      ),
    );

  let drawn: ReactNode;
  if (cover.design === "bold") {
    drawn = (
      <>
        <Photo
          cover={cover}
          box={9 / 16}
          className="absolute inset-0 h-full w-full"
        />
        <div
          className="absolute inset-0"
          style={{
            background: top
              ? "linear-gradient(180deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.3) 42%, transparent 60%)"
              : "linear-gradient(0deg, rgba(0,0,0,.8) 0%, rgba(0,0,0,.45) 42%, transparent 66%)",
          }}
        />
        <p
          className="absolute m-0 text-center uppercase"
          style={{
            ...at,
            fontFamily: BOLD_FACE,
            fontWeight: 400,
            fontSize: `${15 * scale}cqw`,
            lineHeight: 1.02,
            color: "#ffffff",
            textShadow: "0 0.6cqw 0 rgba(0,0,0,.35)",
            textWrap: "balance",
          }}
        >
          {hook({
            display: "inline-block",
            background: lit,
            color: inkOn(lit),
            padding: "0 1.8cqw",
            margin: "0.6cqw 0",
            transform: "rotate(-2deg)",
            textShadow: "none",
          })}
        </p>
      </>
    );
  } else if (cover.design === "poster") {
    const ground = colors.background || "#F1E7DB";
    const arch = 106;
    drawn = (
      <div className="absolute inset-0" style={{ background: ground }}>
        {/* her name and the hook, centred in the room above the arch */}
        <div
          className="absolute flex flex-col items-center justify-center text-center"
          style={{
            top: TOP,
            left: SIDE,
            right: SIDE,
            height: `${HEIGHT - arch - 24}cqw`,
            gap: "3cqw",
          }}
        >
          <p
            className="m-0 uppercase"
            style={{
              fontFamily: body,
              fontWeight: 600,
              fontSize: "3cqw",
              letterSpacing: ".26em",
              color: colors.muted || inkOn(ground),
            }}
          >
            {brand.name}
          </p>
          <p
            className="m-0"
            style={{
              fontFamily: display,
              fontWeight: 700,
              fontSize: `${10.5 * scale}cqw`,
              lineHeight: 1.04,
              letterSpacing: "-0.01em",
              color: colors.foreground || inkOn(ground),
              textWrap: "balance",
            }}
          >
            {hook({ color: colors.primary || lit, fontStyle: "italic" })}
          </p>
        </div>
        <div
          className="absolute overflow-hidden"
          style={{
            left: "11cqw",
            right: "11cqw",
            bottom: 0,
            height: `${arch}cqw`,
            borderRadius: "39cqw 39cqw 0 0",
          }}
        >
          <Photo cover={cover} box={78 / arch} className="h-full w-full" />
        </div>
      </div>
    );
  } else if (cover.design === "series") {
    const block = colors.inverse || colors.primary || "#1F2A2E";
    const ink = colors.inverseForeground || inkOn(block);
    const band = 76;
    drawn = (
      <>
        <div
          className="absolute inset-x-0 top-0"
          style={{ height: `${band}cqw`, background: block }}
        />
        <Photo
          cover={cover}
          box={100 / (HEIGHT - band)}
          className="absolute inset-x-0 bottom-0 w-full"
          style={{ top: `${band}cqw`, height: `${HEIGHT - band}cqw` }}
        />
        {cover.label ? (
          <p
            className="absolute m-0 uppercase"
            style={{
              top: TOP,
              left: SIDE,
              fontFamily: body,
              fontWeight: 800,
              fontSize: "2.8cqw",
              letterSpacing: ".2em",
              padding: "1.2cqw 2cqw",
              borderRadius: "0.8cqw",
              background: lit,
              color: inkOn(lit),
            }}
          >
            {cover.label}
          </p>
        ) : null}
        <p
          className="absolute m-0"
          style={{
            top: cover.label ? "30cqw" : TOP,
            left: SIDE,
            right: SIDE,
            fontFamily: display,
            fontWeight: 700,
            fontSize: `${10.8 * scale}cqw`,
            lineHeight: 1.04,
            color: ink,
            textWrap: "balance",
          }}
        >
          {hook({ color: lit, fontStyle: "italic" })}
        </p>
      </>
    );
  } else {
    drawn = (
      <>
        <Photo
          cover={cover}
          box={9 / 16}
          className="absolute inset-0 h-full w-full"
        />
        <div
          className="absolute inset-0"
          style={{
            background: top
              ? "linear-gradient(180deg, rgba(14,11,9,.8) 0%, rgba(14,11,9,.25) 45%, transparent 62%)"
              : "linear-gradient(0deg, rgba(14,11,9,.84) 0%, rgba(14,11,9,.35) 46%, transparent 66%)",
          }}
        />
        <div className="absolute" style={at}>
          <p
            className="m-0 uppercase"
            style={{
              fontFamily: body,
              fontWeight: 600,
              fontSize: "3cqw",
              letterSpacing: ".28em",
              color: "#f4ede4",
            }}
          >
            {brand.name}
          </p>
          <div
            style={{
              width: "11cqw",
              height: "0.45cqw",
              background: lit,
              margin: "2.4cqw 0 3cqw",
            }}
          />
          <p
            className="m-0"
            style={{
              fontFamily: display,
              fontWeight: 700,
              fontSize: `${12.5 * scale}cqw`,
              lineHeight: 1.03,
              color: "#ffffff",
              textWrap: "balance",
            }}
          >
            {hook({ color: lit, fontStyle: "italic" })}
          </p>
        </div>
      </>
    );
  }

  return (
    <div
      data-cover-design={cover.design}
      role="img"
      aria-label={plainHook(cover.title)}
      className={cn(
        "relative aspect-[9/16] w-full overflow-hidden bg-neutral-900 [container-type:inline-size]",
        className,
      )}
    >
      {drawn}
    </div>
  );
}

function Photo({
  cover,
  box,
  className,
  style,
}: {
  cover: ReelCoverCard;
  box: number;
  className?: string;
  style?: CSSProperties;
}) {
  if (!cover.photo)
    return (
      <div
        className={className}
        style={{
          background: "linear-gradient(160deg, #3b3b3b 0%, #141414 100%)",
          ...style,
        }}
      />
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a signed storage link, drawn as is
    <img
      src={cover.photo}
      alt=""
      className={cn("object-cover", className)}
      style={{
        objectPosition: focus(cover.aspect, box, cover.face),
        ...style,
      }}
    />
  );
}
