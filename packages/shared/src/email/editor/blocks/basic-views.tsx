"use client";

import {
  Code2,
  Facebook,
  ImagePlus,
  Instagram,
  Linkedin,
  Music2,
  Twitter,
  Youtube,
} from "lucide-react";

import { useTranslations } from "next-intl";

import { Button } from "../../../ui/button";
import { useEmailEditor } from "../store";
import type {
  ButtonBlock,
  DividerBlock,
  HeadingBlock,
  HtmlBlock,
  ImageBlock,
  SocialBlock,
  SpacerBlock,
} from "../types";
import { padCss } from "./helpers";
import { InlineText } from "./inline-text";

export function HeadingView({ block }: { block: HeadingBlock }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.canvas");
  const s = block.style;
  const size = s.fontSize || 28;
  const tag = `h${block.data.level || 2}` as "h1" | "h2" | "h3" | "h4";
  return (
    <div
      style={{
        padding: padCss(s.padding),
        textAlign: s.alignment ?? "left",
        backgroundColor: s.backgroundColor ?? undefined,
      }}
    >
      <InlineText
        as={tag}
        value={block.data.text}
        placeholder={t("heading")}
        label={t("heading")}
        onChange={(text) => store.update(block.id, { data: { text } })}
        style={{
          margin: 0,
          color: s.color,
          fontSize: size,
          fontFamily: s.fontFamily,
          fontWeight: s.fontWeight || 700,
          lineHeight: `${Math.round(size * (s.lineHeight ?? 1.2))}px`,
          letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
          textTransform:
            s.textTransform && s.textTransform !== "none"
              ? s.textTransform
              : undefined,
        }}
      />
    </div>
  );
}

export function ButtonView({ block }: { block: ButtonBlock }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.canvas");
  const s = block.style;
  const border = s.borderWidth
    ? `${s.borderWidth}px ${s.borderStyle && s.borderStyle !== "none" ? s.borderStyle : "solid"} ${s.borderColor || s.backgroundColor}`
    : undefined;
  return (
    <div
      style={{ padding: padCss(s.padding), textAlign: s.alignment ?? "center" }}
    >
      <span
        style={{
          display: s.fullWidth ? "block" : "inline-block",
          boxSizing: "border-box",
          padding: `${s.paddingY ?? 12}px ${s.paddingX ?? 24}px`,
          backgroundColor: s.backgroundColor,
          color: s.color,
          borderRadius: s.borderRadius ?? 4,
          border,
          fontSize: s.fontSize || 16,
          fontFamily: s.fontFamily,
          fontWeight: s.fontWeight ?? 600,
          letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
          textTransform:
            s.textTransform && s.textTransform !== "none"
              ? s.textTransform
              : undefined,
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        <InlineText
          value={block.data.text}
          placeholder={t("button")}
          label={t("buttonLabel")}
          onChange={(text) => store.update(block.id, { data: { text } })}
        />
      </span>
    </div>
  );
}

export function ImageView({ block }: { block: ImageBlock }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.canvas");
  const s = block.style;
  const full = !!s.fullWidth;

  async function choose() {
    const picked = await store.pickImage();
    if (!picked) return;
    store.update(block.id, {
      data: {
        src: picked.src,
        alt: picked.alt || block.data.alt,
        ...(picked.width && picked.height
          ? {
              height: Math.round(
                (block.data.width * picked.height) / picked.width,
              ),
            }
          : {}),
      },
    });
  }

  if (!block.data.src) {
    return (
      <div style={{ padding: full ? 0 : padCss(s.padding) }}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[#b8b8b8] bg-[#f4f4f4] px-4 py-10 font-sans text-[#6b6b6b]">
          <ImagePlus className="h-6 w-6" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void choose()}
          >
            {t("chooseImage")}
          </Button>
        </div>
      </div>
    );
  }

  const margin = { left: "0 auto 0 0", center: "0 auto", right: "0 0 0 auto" }[
    s.alignment ?? "center"
  ];
  return (
    <div style={{ padding: full ? 0 : padCss(s.padding) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.data.src}
        alt={block.data.alt}
        draggable={false}
        style={{
          display: "block",
          maxWidth: "100%",
          width: full ? "100%" : block.data.width,
          height: "auto",
          margin: full ? undefined : margin,
          borderRadius: s.borderRadius ? s.borderRadius : undefined,
        }}
      />
    </div>
  );
}

export function DividerView({ block }: { block: DividerBlock }) {
  const s = block.style;
  return (
    <div style={{ padding: `${s.spacing ?? 20}px 0` }}>
      <div
        style={{
          borderTop: `${s.lineThickness ?? 1}px ${s.lineStyle || "solid"} ${s.lineColor || "#cccccc"}`,
        }}
      />
    </div>
  );
}

export function SpacerView({ block }: { block: SpacerBlock }) {
  const t = useTranslations("studio.emailEditor.canvas");
  return (
    <div
      aria-label={t("spacer")}
      style={{
        height: Math.max(0, block.style.height || 0),
        backgroundColor: block.style.backgroundColor ?? undefined,
      }}
    />
  );
}

const NETWORKS: Record<
  string,
  { color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  facebook: { color: "#1877F2", icon: Facebook },
  instagram: { color: "#E4405F", icon: Instagram },
  twitter: { color: "#000000", icon: Twitter },
  x: { color: "#000000", icon: Twitter },
  linkedin: { color: "#0A66C2", icon: Linkedin },
  youtube: { color: "#FF0000", icon: Youtube },
  tiktok: { color: "#000000", icon: Music2 },
};

/** A round icon per network (the renderer swaps in hosted PNGs of the same marks). */
export function SocialIcon({
  network,
  size,
  monochrome,
  tint,
}: {
  network: string;
  size: number;
  monochrome?: boolean;
  tint?: string;
}) {
  const known = NETWORKS[network.toLowerCase()];
  const Icon = known?.icon;
  return (
    <span
      title={network}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-sans font-semibold uppercase text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size / 3),
        backgroundColor: monochrome
          ? (tint ?? "#718096")
          : (known?.color ?? "#718096"),
      }}
    >
      {Icon ? <Icon className="h-[55%] w-[55%]" /> : network.slice(0, 2)}
    </span>
  );
}

export function SocialView({ block }: { block: SocialBlock }) {
  const t = useTranslations("studio.emailEditor.canvas");
  const s = block.style;
  const justify = { left: "flex-start", center: "center", right: "flex-end" }[
    s.alignment ?? "center"
  ];
  const vertical = s.layout === "vertical";
  return (
    <div
      style={{
        padding: padCss(s.padding),
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: vertical ? justify : "center",
        justifyContent: vertical ? undefined : justify,
        gap: s.spacing ?? 10,
      }}
    >
      {block.data.platforms.map((p, i) => (
        <SocialIcon
          key={`${p.type}-${i}`}
          network={p.type}
          size={s.iconSize || 32}
          monochrome={s.iconStyle === "monochrome"}
        />
      ))}
      {block.data.platforms.length === 0 && (
        <span className="font-sans text-xs opacity-50">{t("socialEmpty")}</span>
      )}
    </div>
  );
}

export function HtmlView({ block }: { block: HtmlBlock }) {
  const t = useTranslations("studio.emailEditor.canvas");
  return (
    <div style={{ padding: padCss(block.style.padding) }}>
      <div className="flex items-center gap-2 rounded-md border border-dashed border-[#b8b8b8] bg-[#f4f4f4] px-4 py-6 font-sans text-xs text-[#6b6b6b]">
        <Code2 className="h-4 w-4 shrink-0" />
        {t("htmlNote")}
      </div>
    </div>
  );
}
