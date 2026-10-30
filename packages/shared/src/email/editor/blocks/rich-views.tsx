"use client";

import { ImagePlus, UserRound } from "lucide-react";

import { useTranslations } from "next-intl";

import { Button } from "../../../ui/button";
import { useEmailEditor } from "../store";
import type { CardBlock, HeroBlock, ListBlock, ProfileBlock } from "../types";
import { padCss, rgba } from "./helpers";
import { InlineText } from "./inline-text";

export function HeroView({ block }: { block: HeroBlock }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.canvas");
  const { data, style: s } = block;
  const height = s.height || 360;
  const set = (patch: Partial<HeroBlock["data"]>) =>
    store.update(block.id, { data: patch });

  async function choose() {
    const picked = await store.pickImage();
    if (picked) set({ backgroundImage: picked.src });
  }

  const v = s.verticalAlignment ?? "bottom";
  const tint = rgba(s.overlayColor || "#000000", s.overlayOpacity ?? 0.4);
  return (
    <div
      style={{
        position: "relative",
        minHeight: height,
        display: "flex",
        alignItems:
          v === "top" ? "flex-start" : v === "center" ? "center" : "flex-end",
        backgroundColor: "#1e293b",
        backgroundImage: data.backgroundImage
          ? `url(${data.backgroundImage})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(${v === "top" ? "to bottom" : "to top"}, ${tint} 60%, transparent 100%)`,
        }}
      />
      {!data.backgroundImage && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 font-sans">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void choose()}
          >
            <ImagePlus /> {t("chooseImage")}
          </Button>
        </div>
      )}
      <div
        style={{
          position: "relative",
          width: "100%",
          padding: 32,
          textAlign: s.contentAlignment ?? "center",
        }}
      >
        <InlineText
          as="h2"
          value={data.heading}
          placeholder={t("headline")}
          label={t("heroHeadline")}
          onChange={(heading) => set({ heading })}
          style={{
            margin: "0 0 8px",
            color: s.headingColor || "#ffffff",
            fontSize: s.headingFontSize || 34,
            fontFamily: s.headingFontFamily,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        />
        <InlineText
          as="p"
          value={data.subheading}
          placeholder={t("supportingLine")}
          label={t("heroSubheading")}
          onChange={(subheading) => set({ subheading })}
          style={{
            margin: "0 0 20px",
            color: s.subheadingColor || "#ffffffcc",
            lineHeight: 1.5,
          }}
        />
        <span
          style={{
            display: "inline-block",
            padding: "14px 32px",
            backgroundColor: s.buttonBackgroundColor || "#ffffff",
            color: s.buttonTextColor || "#000000",
            borderRadius: s.buttonBorderRadius ?? 50,
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <InlineText
            value={data.buttonText}
            placeholder={t("button")}
            label={t("heroButton")}
            onChange={(buttonText) => set({ buttonText })}
          />
        </span>
      </div>
    </div>
  );
}

function IconBadge({ block }: { block: CardBlock }) {
  const { data, style: s } = block;
  const size = s.iconSize ?? 48;
  const radius = `${s.iconBorderRadius ?? 50}%`;
  if (data.iconMode === "image" && data.iconImageSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.iconImageSrc}
        alt={data.iconImageAlt}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          margin: "0 auto 12px",
          display: "block",
        }}
      />
    );
  }
  // Emoji (lucide icons from imported designs show their emoji too: SVG never reaches an inbox).
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: s.iconBackgroundColor ?? "#eef2ff",
        fontSize: size * 0.55,
        lineHeight: 1,
        marginBottom: 12,
      }}
    >
      {data.iconEmoji || "✨"}
    </span>
  );
}

export function CardView({ block }: { block: CardBlock }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.canvas");
  const { data, style: s } = block;
  const set = (patch: Partial<CardBlock["data"]>) =>
    store.update(block.id, { data: patch });
  return (
    <div
      style={{
        padding: padCss(s.padding, 24),
        backgroundColor: s.backgroundColor ?? "#ffffff",
        borderRadius: s.borderRadius ?? 12,
        border:
          (s.borderWidth ?? 0) > 0
            ? `${s.borderWidth}px ${s.borderStyle && s.borderStyle !== "none" ? s.borderStyle : "solid"} ${s.borderColor ?? "#e2e8f0"}`
            : undefined,
        textAlign: s.contentAlignment ?? "center",
      }}
    >
      {data.showIcon && (
        <div>
          <IconBadge block={block} />
        </div>
      )}
      {data.showBadge && (
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: 12,
              backgroundColor: s.badgeBackgroundColor ?? "#eef2ff",
              color: s.badgeTextColor ?? "#4338ca",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            <InlineText
              value={data.badgeText}
              placeholder={t("badge")}
              label={t("badge")}
              onChange={(badgeText) => set({ badgeText })}
            />
          </span>
        </div>
      )}
      <InlineText
        as="h3"
        value={data.heading}
        placeholder={t("cardHeading")}
        label={t("cardHeading")}
        onChange={(heading) => set({ heading })}
        style={{
          margin: "0 0 8px",
          color: s.headingColor,
          fontSize: s.headingFontSize ?? 22,
          fontFamily: s.headingFontFamily,
          fontWeight: s.headingFontWeight ?? 700,
          lineHeight: 1.3,
        }}
      />
      <InlineText
        as="p"
        value={data.body}
        placeholder={t("shortDescription")}
        label={t("cardText")}
        onChange={(body) => set({ body })}
        style={{
          margin: "0 0 16px",
          color: s.bodyColor,
          fontSize: s.bodyFontSize ?? 15,
          fontFamily: s.bodyFontFamily,
          lineHeight: s.lineHeight ?? 1.5,
        }}
      />
      {data.showButton && (
        <span
          style={{
            display: s.buttonFullWidth ? "block" : "inline-block",
            boxSizing: "border-box",
            padding: `${s.buttonPaddingY ?? 10}px ${s.buttonPaddingX ?? 20}px`,
            backgroundColor: s.buttonBackgroundColor,
            color: s.buttonTextColor,
            borderRadius: s.buttonBorderRadius ?? 6,
            fontSize: s.buttonFontSize ?? 14,
            fontFamily: s.buttonFontFamily,
            fontWeight: s.buttonFontWeight ?? 600,
            textAlign: "center",
          }}
        >
          <InlineText
            value={data.buttonText}
            placeholder={t("button")}
            label={t("cardButton")}
            onChange={(buttonText) => set({ buttonText })}
          />
        </span>
      )}
    </div>
  );
}

export function ListView({ block }: { block: ListBlock }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.canvas");
  const { data, style: s } = block;
  const horizontal = s.layout === "horizontal";
  const iconSize = s.iconSize ?? 20;
  const setItem = (id: string, text: string) =>
    store.update(block.id, {
      data: {
        items: data.items.map((it) => (it.id === id ? { ...it, text } : it)),
      },
    });
  return (
    <div
      style={{
        padding: padCss(s.padding, 16),
        backgroundColor: s.backgroundColor ?? undefined,
        textAlign: s.contentAlignment ?? "left",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: horizontal ? "row" : "column",
          flexWrap: horizontal ? "wrap" : undefined,
          gap: s.spacing ?? 12,
          justifyContent: horizontal
            ? { left: "flex-start", center: "center", right: "flex-end" }[
                s.contentAlignment ?? "left"
              ]
            : undefined,
        }}
      >
        {data.items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: item.subtitle ? "flex-start" : "center",
              gap: 10,
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontSize: iconSize,
                color: s.iconColor,
                lineHeight: 1,
                flexShrink: 0,
                width: iconSize + 4,
                textAlign: "center",
              }}
            >
              {item.icon || "•"}
            </span>
            <div>
              <InlineText
                value={item.text}
                placeholder={t("listItem")}
                label={t("listItem")}
                onChange={(text) => setItem(item.id, text)}
                style={{
                  color: s.textColor,
                  fontSize: s.textFontSize ?? 15,
                  fontFamily: s.textFontFamily,
                  fontWeight: s.textFontWeight ?? 500,
                  lineHeight: 1.4,
                }}
              />
              {item.subtitle && (
                <div
                  style={{
                    color: s.subtitleColor,
                    fontSize: s.subtitleFontSize ?? 13,
                    fontFamily: s.textFontFamily,
                    lineHeight: 1.4,
                    marginTop: 2,
                  }}
                >
                  {item.subtitle}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileView({ block }: { block: ProfileBlock }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.canvas");
  const { data, style: s } = block;
  const set = (patch: Partial<ProfileBlock["data"]>) =>
    store.update(block.id, { data: patch });
  const size = s.imageSize ?? 72;
  const top = s.imagePosition === "top";

  async function choose() {
    const picked = await store.pickImage();
    if (picked)
      set({ imageSrc: picked.src, imageAlt: picked.alt || data.imageAlt });
  }

  const image = data.imageSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={data.imageSrc}
      alt={data.imageAlt}
      style={{
        width: size,
        height: size,
        borderRadius: `${s.imageBorderRadius ?? 50}%`,
        objectFit: "cover",
        display: "block",
      }}
    />
  ) : (
    <button
      type="button"
      title={t("choosePhoto")}
      onClick={() => void choose()}
      className="flex items-center justify-center border-2 border-dashed border-[#cbd5e1] bg-[#f1f5f9] text-[#94a3b8]"
      style={{
        width: size,
        height: size,
        borderRadius: `${s.imageBorderRadius ?? 50}%`,
      }}
    >
      <UserRound className="h-1/2 w-1/2" />
    </button>
  );

  return (
    <div
      style={{
        padding: padCss(s.padding, 20),
        backgroundColor: s.backgroundColor ?? "#ffffff",
        borderRadius: s.borderRadius ?? 12,
        border:
          (s.borderWidth ?? 0) > 0
            ? `${s.borderWidth}px ${s.borderStyle && s.borderStyle !== "none" ? s.borderStyle : "solid"} ${s.borderColor ?? "#e2e8f0"}`
            : undefined,
        display: top ? "block" : "flex",
        flexDirection: s.imagePosition === "right" ? "row-reverse" : "row",
        alignItems: "center",
        gap: 16,
        textAlign: top ? (s.contentAlignment ?? "center") : "left",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: size,
          margin: top ? "0 auto 12px" : undefined,
        }}
      >
        {image}
      </div>
      <div style={{ minWidth: 0 }}>
        {data.showBadge && (
          <div style={{ marginBottom: 4 }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 10,
                backgroundColor: s.badgeBackgroundColor ?? "#eef2ff",
                color: s.badgeTextColor ?? "#4338ca",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {data.badgeText}
            </span>
          </div>
        )}
        <InlineText
          as="div"
          value={data.name}
          placeholder={t("name")}
          label={t("name")}
          onChange={(name) => set({ name })}
          style={{
            color: s.nameColor,
            fontSize: s.nameFontSize ?? 18,
            fontFamily: s.nameFontFamily,
            fontWeight: s.nameFontWeight ?? 700,
            lineHeight: 1.3,
          }}
        />
        <InlineText
          as="div"
          value={data.role}
          placeholder={t("role")}
          label={t("role")}
          onChange={(role) => set({ role })}
          style={{
            color: s.roleColor,
            fontSize: s.roleFontSize ?? 13,
            fontFamily: s.bioFontFamily,
            fontWeight: 600,
            lineHeight: 1.3,
            marginTop: 2,
          }}
        />
        <InlineText
          as="div"
          value={data.bio}
          placeholder={t("shortBio")}
          label={t("bio")}
          onChange={(bio) => set({ bio })}
          style={{
            color: s.bioColor,
            fontSize: s.bioFontSize ?? 14,
            fontFamily: s.bioFontFamily,
            lineHeight: s.lineHeight ?? 1.5,
            marginTop: 6,
          }}
        />
      </div>
    </div>
  );
}
