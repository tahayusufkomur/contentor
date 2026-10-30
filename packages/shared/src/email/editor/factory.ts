// New blocks in her brand: every colour and font is a brand token, so a block
// added today follows a look change tomorrow. Insets match the text column
// (32px each side) so blocks line up without fiddling.

import { useTranslations } from "next-intl";

import type siteEn from "../../i18n/messages/en/site.json";
import { BRAND_SETTINGS, mintBlockId } from "./tree";
import type {
  Block,
  BlockType,
  ColumnsBlock,
  EmailDesign,
  Spacing,
} from "./types";

/** The words a new block starts with. What a student reads if she leaves them
 *  alone, so they come in the SITE's language (site.email.defaults.*), once:
 *  after that the text is hers. */
export type DefaultKey = keyof (typeof siteEn)["email"]["defaults"];
export type DefaultText = (key: DefaultKey) => string;

export function useDefaultText(): DefaultText {
  const t = useTranslations("site.email.defaults");
  return (key) => t(key);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pad = (top: number, side: number, bottom: number = top): Spacing => ({
  top,
  right: side,
  bottom,
  left: side,
});

const SIDE = 32;

function columns(
  count: 1 | 2 | 3,
  extra: Partial<ColumnsBlock["style"]> = {},
): ColumnsBlock {
  return {
    id: mintBlockId(),
    type: "columns",
    data: {
      columnCount: count,
      columnRatio: Array.from({ length: count }, () => Math.round(100 / count)),
      columns: Array.from({ length: count }, (_, i) => ({
        id: mintBlockId(),
        blocks: [],
        padding: {
          top: 0,
          right: i === count - 1 ? SIDE : 0,
          bottom: 0,
          left: i === 0 ? SIDE : 0,
        },
      })),
    },
    style: { gap: 16, stackOnMobile: true, verticalAlignment: "top", ...extra },
  };
}

export function createBlock(type: BlockType, text: DefaultText): Block {
  const id = mintBlockId();
  switch (type) {
    case "text":
      return {
        id,
        type,
        data: { html: `<p>${escapeHtml(text("message"))}</p>`, variables: [] },
        style: { padding: pad(10, SIDE) },
      };
    case "heading":
      return {
        id,
        type,
        data: { text: text("headline"), level: 2 },
        style: {
          padding: pad(20, SIDE, 8),
          alignment: "left",
          color: "brand:foreground",
          fontSize: 28,
          fontFamily: "brand:heading",
          fontWeight: 700,
          letterSpacing: 0,
          textTransform: "none",
        },
      };
    case "button":
      return {
        id,
        type,
        data: { text: text("buttonLabel"), url: "/" },
        style: {
          padding: pad(16, SIDE),
          alignment: "left",
          backgroundColor: "brand:primary",
          color: "brand:primaryForeground",
          borderRadius: 8,
          fullWidth: false,
          fontSize: 16,
          fontFamily: "brand:body",
          fontWeight: 600,
          paddingX: 28,
          paddingY: 14,
        },
      };
    case "image":
      return {
        id,
        type,
        data: { src: "", alt: "", width: 600 - SIDE * 2 },
        style: {
          padding: pad(8, SIDE),
          alignment: "center",
          borderRadius: 8,
          fullWidth: false,
        },
      };
    case "divider":
      return {
        id,
        type,
        data: {},
        style: {
          lineStyle: "solid",
          lineColor: "brand:border",
          lineThickness: 1,
          spacing: 16,
        },
      };
    case "spacer":
      return {
        id,
        type,
        data: {},
        style: { height: 24, backgroundColor: null },
      };
    case "columns":
      return columns(2);
    case "social":
      return {
        id,
        type,
        data: {
          platforms: [
            { type: "instagram", url: "https://instagram.com/" },
            { type: "facebook", url: "https://facebook.com/" },
          ],
        },
        style: {
          padding: pad(12, SIDE),
          alignment: "center",
          iconSize: 28,
          iconStyle: "colored",
          layout: "horizontal",
          spacing: 10,
        },
      };
    case "hero":
      return {
        id,
        type,
        data: {
          backgroundImage: "",
          heading: text("heroHeadline"),
          subheading: text("heroSupport"),
          buttonText: text("heroButton"),
          buttonUrl: "/",
        },
        style: {
          height: 360,
          overlayColor: "#000000",
          overlayOpacity: 0.35,
          headingColor: "#ffffff",
          headingFontSize: 34,
          headingFontFamily: "brand:heading",
          subheadingColor: "#ffffffdd",
          buttonBackgroundColor: "brand:primary",
          buttonTextColor: "brand:primaryForeground",
          buttonBorderRadius: 8,
          contentAlignment: "center",
          verticalAlignment: "bottom",
        },
      };
    case "card":
      return {
        id,
        type,
        data: {
          showIcon: false,
          iconMode: "emoji",
          iconEmoji: "✨",
          iconImageSrc: "",
          iconImageAlt: "",
          showBadge: false,
          badgeText: text("cardBadge"),
          heading: text("cardTitle"),
          body: text("cardBody"),
          showButton: true,
          buttonText: text("cardButton"),
          buttonUrl: "/",
        },
        style: {
          padding: pad(28, SIDE),
          backgroundColor: "brand:surface",
          borderRadius: 12,
          borderWidth: 0,
          borderColor: "brand:border",
          borderStyle: "solid",
          iconSize: 48,
          iconBackgroundColor: "brand:background",
          iconBorderRadius: 50,
          badgeBackgroundColor: "brand:primary",
          badgeTextColor: "brand:primaryForeground",
          headingColor: "brand:foreground",
          headingFontSize: 22,
          headingFontFamily: "brand:heading",
          headingFontWeight: 700,
          bodyColor: "brand:muted",
          bodyFontSize: 15,
          bodyFontFamily: "brand:body",
          buttonBackgroundColor: "brand:primary",
          buttonTextColor: "brand:primaryForeground",
          buttonBorderRadius: 8,
          buttonFontSize: 14,
          buttonFontFamily: "brand:body",
          buttonFontWeight: 600,
          buttonPaddingX: 20,
          buttonPaddingY: 10,
          buttonFullWidth: false,
          contentAlignment: "center",
        },
      };
    case "list":
      return {
        id,
        type,
        data: {
          items: [text("listFirst"), text("listSecond"), text("listThird")].map(
            (item) => ({
              id: mintBlockId(),
              icon: "✓",
              text: item,
              subtitle: "",
            }),
          ),
        },
        style: {
          padding: pad(12, SIDE),
          iconSize: 18,
          iconColor: "brand:primary",
          textColor: "brand:foreground",
          textFontSize: 16,
          textFontFamily: "brand:body",
          textFontWeight: 500,
          subtitleColor: "brand:muted",
          subtitleFontSize: 14,
          spacing: 10,
          layout: "vertical",
          contentAlignment: "left",
        },
      };
    case "profile":
      return {
        id,
        type,
        data: {
          imageSrc: "",
          imageAlt: "",
          name: text("profileName"),
          role: text("profileRole"),
          bio: text("profileBio"),
          showBadge: false,
          badgeText: text("profileBadge"),
        },
        style: {
          padding: pad(24, SIDE),
          backgroundColor: "brand:surface",
          borderRadius: 12,
          borderWidth: 0,
          borderColor: "brand:border",
          borderStyle: "solid",
          imageSize: 72,
          imageBorderRadius: 50,
          imagePosition: "left",
          nameColor: "brand:foreground",
          nameFontSize: 18,
          nameFontFamily: "brand:heading",
          nameFontWeight: 700,
          roleColor: "brand:primary",
          roleFontSize: 13,
          bioColor: "brand:muted",
          bioFontSize: 14,
          bioFontFamily: "brand:body",
          badgeBackgroundColor: "brand:primary",
          badgeTextColor: "brand:primaryForeground",
          contentAlignment: "left",
        },
      };
    case "html":
      return { id, type, data: { html: "" }, style: {} };
    case "brandHeader":
      return {
        id,
        type,
        data: { variant: "logo" },
        style: {
          padding: pad(28, SIDE, 20),
          alignment: "center",
          backgroundColor: null,
          color: "brand:foreground",
          logoHeight: 44,
        },
      };
    case "brandFooter":
      return {
        id,
        type,
        data: { showSocial: true, showAddress: true, note: "" },
        style: {
          padding: pad(24, SIDE, 32),
          alignment: "center",
          backgroundColor: null,
          color: "brand:muted",
          fontSize: 13,
        },
      };
    case "item":
      return {
        id,
        type,
        data: {
          ref: "",
          layout: "card",
          showImage: true,
          showSummary: true,
          showMeta: true,
          buttonText: text("itemButton"),
        },
        style: {
          padding: pad(12, SIDE),
          backgroundColor: "brand:surface",
          borderRadius: 12,
          titleColor: "brand:foreground",
          textColor: "brand:muted",
          buttonColor: "brand:primary",
          buttonTextColor: "brand:primaryForeground",
        },
      };
  }
}

/** Three-column row. */
export const createThreeColumns = () => columns(3);

/** A one-column band on her surface colour (a section to put blocks in). */
export function createSection(): ColumnsBlock {
  const block = columns(1, { gap: 0, verticalAlignment: "center" });
  block.data.columns[0] = {
    ...block.data.columns[0],
    backgroundColor: "brand:surface",
    padding: pad(24, 0),
  };
  return block;
}

/** A quote: larger serif-ish text on the surface colour. */
export function createQuote(text: DefaultText): Block {
  return {
    id: mintBlockId(),
    type: "text",
    data: {
      html: `<p><em>${escapeHtml(text("quote"))}</em></p><p>${escapeHtml(text("quoteBy"))}</p>`,
      variables: [],
    },
    style: {
      padding: pad(24, 48),
      alignment: "center",
      fontSize: 19,
      backgroundColor: "brand:surface",
    },
  };
}

/** Her header, an empty body and her footer, all in brand tokens. */
export function blankDesign(): EmailDesign {
  // The header and footer carry her brand, no words of ours.
  const none: DefaultText = () => "";
  return {
    version: 1,
    settings: { ...BRAND_SETTINGS },
    header: { blocks: [createBlock("brandHeader", none)] },
    body: { blocks: [] },
    footer: { blocks: [createBlock("brandFooter", none)] },
  };
}
