import type { CSSProperties } from "react";

import type { Block, BlockType, Spacing } from "../types";

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: "Text",
  heading: "Heading",
  button: "Button",
  image: "Image",
  divider: "Divider",
  spacer: "Spacer",
  columns: "Columns",
  social: "Social links",
  hero: "Hero",
  card: "Card",
  list: "List",
  profile: "Profile",
  html: "Custom HTML",
  brandHeader: "Brand header",
  brandFooter: "Brand footer",
  item: "Featured item",
};

export const blockLabel = (type: BlockType) => BLOCK_LABELS[type] ?? type;

export function padCss(p: Partial<Spacing> | undefined, fallback = 0): string {
  const v = (n: number | undefined) => `${n ?? fallback}px`;
  return `${v(p?.top)} ${v(p?.right)} ${v(p?.bottom)} ${v(p?.left)}`;
}

// The blocks that draw their own border and radius (the renderer ignores the frame's for them).
const OWN_BORDER: BlockType[] = [
  "card",
  "profile",
  "button",
  "image",
  "item",
  "brandHeader",
  "brandFooter",
];

function rgba(hex: string, opacity: number) {
  const h = hex.replace("#", "").padEnd(6, "0");
  const n = (i: number) => parseInt(h.substring(i, i + 2), 16) || 0;
  return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${opacity})`;
}

/** Canvas CSS for the frame keys any block may carry (background image or
 *  gradient, border, radius), as the renderer frames the block's row. */
export function frameCss(block: Block): CSSProperties {
  const s = block.style ?? {};
  const css: CSSProperties = {};
  if (s.backgroundImage) {
    const img = `url(${s.backgroundImage})`;
    if (s.backgroundOverlay) {
      const tint = rgba(s.backgroundOverlay, s.backgroundOverlayOpacity ?? 0.4);
      css.backgroundImage = `linear-gradient(${tint}, ${tint}), ${img}`;
    } else {
      css.backgroundImage = img;
    }
    css.backgroundSize = "cover";
    css.backgroundPosition = "center";
  } else if (s.backgroundGradient) {
    css.background = s.backgroundGradient;
  }
  if (!OWN_BORDER.includes(block.type)) {
    if (s.borderWidth && s.borderWidth > 0) {
      const style =
        s.borderStyle && s.borderStyle !== "none" ? s.borderStyle : "solid";
      css.border = `${s.borderWidth}px ${style} ${s.borderColor || "#000000"}`;
    }
    if (s.borderRadius) css.borderRadius = `${s.borderRadius}px`;
  }
  return css;
}

export { rgba };
