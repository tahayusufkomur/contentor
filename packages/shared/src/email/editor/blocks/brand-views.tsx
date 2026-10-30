"use client";

import { Sparkles } from "lucide-react";

import { useTranslations } from "next-intl";

import { Button } from "../../../ui/button";
import { useEmailEditor } from "../store";
import type {
  BrandFooterBlock,
  BrandHeaderBlock,
  CatalogItem,
  ItemBlock,
} from "../types";
import { SocialIcon } from "./basic-views";
import { padCss } from "./helpers";

const JUSTIFY = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

export function BrandHeaderView({ block }: { block: BrandHeaderBlock }) {
  const { kit, resolved } = useEmailEditor();
  const s = block.style;
  const height = s.logoHeight ?? 44;
  const variant = block.data.variant;
  const src = variant === "mark" || !kit.logo ? kit.mark : kit.logo;
  const showImage = variant !== "name" && !!src;
  const showName = variant === "name" || variant === "logoName" || !src;
  return (
    <div
      style={{
        padding: padCss(s.padding),
        backgroundColor: s.backgroundColor ?? undefined,
        display: "flex",
        alignItems: "center",
        justifyContent: JUSTIFY[s.alignment ?? "center"],
        gap: 12,
      }}
    >
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={kit.name}
          style={{ height, width: "auto", display: "block" }}
        />
      )}
      {showName && (
        <span
          style={{
            color: s.color ?? resolved.settings.defaultColor,
            fontFamily: kit.fonts.heading,
            fontSize: Math.max(18, Math.round(height * 0.5)),
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {kit.name}
        </span>
      )}
    </div>
  );
}

export function BrandFooterView({ block }: { block: BrandFooterBlock }) {
  const { kit } = useEmailEditor();
  // What students read at the foot of the email: the site's language.
  const site = useTranslations("site.email");
  const s = block.style;
  const size = s.fontSize ?? 13;
  const align = s.alignment ?? "center";
  const line = { margin: "0 0 6px", lineHeight: 1.5 };
  return (
    <div
      style={{
        padding: padCss(s.padding),
        backgroundColor: s.backgroundColor ?? undefined,
        color: s.color ?? undefined,
        fontSize: size,
        textAlign: align,
      }}
    >
      {block.data.showSocial && kit.socials.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: JUSTIFY[align],
            gap: 8,
            marginBottom: 12,
          }}
        >
          {kit.socials.map((social) => (
            <SocialIcon
              key={social.network}
              network={social.network}
              size={26}
            />
          ))}
        </div>
      )}
      <p style={line}>
        <strong>{kit.name}</strong> ·{" "}
        <span style={{ textDecoration: "underline" }}>{kit.host}</span>
      </p>
      {block.data.showAddress && kit.address && (
        <p style={line}>{kit.address}</p>
      )}
      {block.data.note && <p style={line}>{block.data.note}</p>}
      <p style={{ ...line, margin: 0 }}>
        <span style={{ textDecoration: "underline" }}>
          {site("unsubscribe")}
        </span>
      </p>
    </div>
  );
}

function ItemImage({ item, height }: { item: CatalogItem; height?: number }) {
  if (!item.image) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image}
      alt={item.title}
      style={{
        display: "block",
        width: "100%",
        height: height ?? "auto",
        objectFit: "cover",
      }}
    />
  );
}

export function ItemView({ block }: { block: ItemBlock }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.canvas");
  const s = block.style;
  const d = block.data;
  const item = store.items.find((i) => i.ref === d.ref);
  const radius = s.borderRadius ?? 12;

  async function choose() {
    if (!store.pickItem) return;
    const picked = await store.pickItem();
    if (picked) store.update(block.id, { data: { ref: picked.ref } });
  }

  if (!item) {
    return (
      <div style={{ padding: padCss(s.padding) }}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[#b8b8b8] bg-[#f4f4f4] px-4 py-8 text-center font-sans text-sm text-[#6b6b6b]">
          <Sparkles className="h-5 w-5" />
          {d.ref ? t("itemGone") : t("itemPick")}
          {store.pickItem && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void choose()}
            >
              {t("itemChoose")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const button = d.buttonText ? (
    <span
      style={{
        display: "inline-block",
        marginTop: 14,
        padding: "11px 22px",
        borderRadius: Math.min(radius, 8),
        backgroundColor: s.buttonColor,
        color: s.buttonTextColor,
        fontWeight: 600,
        fontSize: 15,
      }}
    >
      {d.buttonText}
    </span>
  ) : null;
  const meta =
    d.showMeta && item.meta ? (
      <div
        style={{
          color: s.textColor,
          fontSize: 14,
          fontWeight: 600,
          marginTop: 4,
        }}
      >
        {item.meta}
      </div>
    ) : null;
  const summary =
    d.showSummary && item.summary ? (
      <div
        style={{
          color: s.textColor,
          fontSize: 15,
          lineHeight: 1.5,
          marginTop: 8,
        }}
      >
        {item.summary}
      </div>
    ) : null;
  const title = (
    <div
      style={{
        color: s.titleColor,
        fontSize: d.layout === "compact" ? 17 : 21,
        fontWeight: 700,
        lineHeight: 1.3,
      }}
    >
      {item.title}
    </div>
  );

  if (d.layout === "compact") {
    return (
      <div style={{ padding: padCss(s.padding) }}>
        <div
          style={{
            backgroundColor: s.backgroundColor ?? undefined,
            borderRadius: radius,
            padding: "14px 18px",
          }}
        >
          <span
            style={{
              textDecoration: "underline",
              textDecorationColor: s.buttonColor,
            }}
          >
            {title}
          </span>
          {meta}
        </div>
      </div>
    );
  }

  if (d.layout === "row") {
    return (
      <div style={{ padding: padCss(s.padding) }}>
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            backgroundColor: s.backgroundColor ?? undefined,
            borderRadius: radius,
            overflow: "hidden",
          }}
        >
          {d.showImage && item.image && (
            <div style={{ width: 180, flexShrink: 0, alignSelf: "stretch" }}>
              <ItemImage item={item} height={150} />
            </div>
          )}
          <div
            style={{
              padding: "16px 18px 16px 0",
              paddingLeft: d.showImage && item.image ? 0 : 18,
              minWidth: 0,
            }}
          >
            {title}
            {meta}
            {summary}
            {button}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: padCss(s.padding) }}>
      <div
        style={{
          backgroundColor: s.backgroundColor ?? undefined,
          borderRadius: radius,
          overflow: "hidden",
        }}
      >
        {d.showImage && <ItemImage item={item} />}
        <div style={{ padding: "20px 24px 24px" }}>
          {title}
          {meta}
          {summary}
          {button}
        </div>
      </div>
    </div>
  );
}
