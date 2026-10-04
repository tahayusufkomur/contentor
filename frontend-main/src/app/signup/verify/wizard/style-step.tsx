"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { rankStylesForNiche } from "@shared/sections/styles";
import type { SiteStyle } from "@shared/sections/types";
import { OptionCard, OptionList, SlideHeader } from "./steps";

/** One stylesheet for every style's fonts, so each card can set the coach's
 *  brand in that style's own display face. */
function fontsHref(styles: SiteStyle[]) {
  return `https://fonts.googleapis.com/css2?${styles.map((s) => s.fonts.googleQuery).join("&")}&display=swap`;
}

/** The coach's brand set in the style: a typographic specimen above a
 *  screenshot of the style's home page (captured from the design showcase). */
function StylePreview({ style, brand }: { style: SiteStyle; brand: string }) {
  const [shot, setShot] = useState(true);
  const p = style.palette;
  return (
    <div className="w-full overflow-hidden rounded-xl border border-black/10 text-left shadow-sm">
      <div
        className="flex items-end justify-between gap-3 px-4 pb-3 pt-5"
        style={{ background: p.background, color: p.foreground }}
      >
        <span
          className="min-w-0 truncate text-[26px] leading-none"
          style={{ fontFamily: `'${style.fonts.display}', serif`, fontWeight: style.id === "kinetic" ? 800 : 400, fontStretch: style.id === "kinetic" ? "70%" : undefined, textTransform: style.id === "kinetic" ? "uppercase" : undefined }}
        >
          {brand || "Your Studio"}
        </span>
        <span className="flex shrink-0 gap-1" aria-hidden>
          {[p.primary, p.accent, p.inverse].map((c) => (
            <span key={c} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: c }} />
          ))}
        </span>
      </div>
      {shot ? (
        // eslint-disable-next-line @next/next/no-img-element -- static asset
        <img
          src={`/wizard/styles/${style.id}.webp`}
          alt=""
          className="block aspect-[16/10] w-full object-cover object-top"
          onError={() => setShot(false)}
        />
      ) : (
        <div
          className="flex aspect-[16/10] w-full flex-col justify-center gap-3 px-5"
          style={{ background: p.surface, color: p.foreground, fontFamily: `'${style.fonts.body}', sans-serif` }}
        >
          <span className="text-[13px] opacity-70">{style.mood}</span>
          <span
            className="w-fit px-3 py-1.5 text-[12px]"
            style={{ background: p.primary, color: p.primaryForeground, borderRadius: style.radius === "0rem" ? 0 : 999 }}
          >
            Explore courses
          </span>
        </div>
      )}
    </div>
  );
}

export function StyleStep({
  niche,
  brand,
  value,
  onChange,
  disabled,
}: {
  niche?: string;
  brand: string;
  value?: string;
  onChange: (style: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("wizard");
  const styles = rankStylesForNiche(niche);
  return (
    <div>
      <link rel="stylesheet" href={fontsHref(styles)} />
      <SlideHeader heading={t("style.heading")} subhead={t("style.subhead")} />
      <OptionList className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {styles.map((style, i) => (
          <OptionCard
            key={style.id}
            selected={value === style.id}
            onSelect={() => onChange(style.id)}
            title={style.label}
            subtitle={style.mood}
            badge={i === 0 ? t("common.recommended") : undefined}
            disabled={disabled}
          >
            <StylePreview style={style} brand={brand} />
          </OptionCard>
        ))}
      </OptionList>
    </div>
  );
}
