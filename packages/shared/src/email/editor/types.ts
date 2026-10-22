// The email design format: MailCraft's EmailTemplate JSON (so imported
// templates, the transactional builder and the AI schema carry over) plus the
// brand tokens and the three native blocks: brandHeader, brandFooter, item.
// Spec: docs/superpowers/specs/2026-10-22-native-email-design.md

export type BlockType =
  | "text"
  | "image"
  | "button"
  | "divider"
  | "columns"
  | "social"
  | "heading"
  | "spacer"
  | "html"
  | "hero"
  | "card"
  | "list"
  | "profile"
  | "brandHeader"
  | "brandFooter"
  | "item";

export type RegionKey = "header" | "body" | "footer";
export type Alignment = "left" | "center" | "right";

export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Colour and font values may be literals or brand tokens ("brand:primary",
 *  "brand:heading"); resolveDesign swaps tokens for the kit's values. */
export interface BlockStyle {
  padding?: Spacing;
  margin?: Spacing;
  backgroundColor?: string | null;
  backgroundGradient?: string | null;
  alignment?: Alignment;
  color?: string | null;
  borderRadius?: number;
  backgroundImage?: string | null;
  backgroundOverlay?: string | null;
  backgroundOverlayOpacity?: number;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: "solid" | "dashed" | "dotted" | "none";
  lineHeight?: number;
}

interface BaseBlock {
  id: string;
  type: BlockType;
  style: BlockStyle;
}

export interface TextBlock extends BaseBlock {
  type: "text";
  data: { html: string; variables: string[] };
  style: BlockStyle & { fontSize?: number };
}

export interface ImageBlock extends BaseBlock {
  type: "image";
  data: {
    src: string;
    alt: string;
    link?: string;
    width: number;
    height?: number;
  };
  style: BlockStyle & { fullWidth?: boolean };
}

export interface ButtonBlock extends BaseBlock {
  type: "button";
  data: { text: string; url: string };
  style: BlockStyle & {
    color: string;
    backgroundColor: string;
    borderRadius: number;
    fullWidth: boolean;
    fontSize: number;
    fontFamily: string;
    fontWeight?: number;
    letterSpacing?: number;
    textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
    paddingX?: number;
    paddingY?: number;
  };
}

export interface DividerBlock extends BaseBlock {
  type: "divider";
  data: Record<string, never>;
  style: BlockStyle & {
    lineStyle: "solid" | "dashed" | "dotted";
    lineColor: string;
    lineThickness: number;
    spacing: number;
  };
}

export interface Column {
  id: string;
  blocks: Block[];
  backgroundColor?: string | null;
  padding?: Spacing;
  borderRadius?: number;
  backgroundImage?: string | null;
}

export interface ColumnsBlock extends BaseBlock {
  type: "columns";
  data: { columnCount: number; columnRatio: number[]; columns: Column[] };
  style: BlockStyle & {
    gap?: number;
    stackOnMobile?: boolean;
    minHeight?: number;
    verticalAlignment?: "top" | "center" | "bottom";
  };
}

export type SocialNetwork =
  | "facebook"
  | "twitter"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "tiktok";

export interface SocialBlock extends BaseBlock {
  type: "social";
  data: { platforms: { type: SocialNetwork; url: string }[] };
  style: BlockStyle & {
    iconSize?: number;
    iconStyle?: "colored" | "monochrome";
    layout?: "horizontal" | "vertical";
    spacing?: number;
  };
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  data: { text: string; level: 1 | 2 | 3 | 4 };
  style: BlockStyle & {
    color: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    letterSpacing?: number;
    textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  };
}

export interface SpacerBlock extends BaseBlock {
  type: "spacer";
  data: Record<string, never>;
  style: BlockStyle & { height: number };
}

/** Render-only: imported MailCraft templates may carry one; the editor never offers it. */
export interface HtmlBlock extends BaseBlock {
  type: "html";
  data: { html: string };
}

export interface HeroBlock extends BaseBlock {
  type: "hero";
  data: {
    backgroundImage: string;
    heading: string;
    subheading: string;
    buttonText: string;
    buttonUrl: string;
  };
  style: BlockStyle & {
    height?: number;
    overlayColor?: string;
    overlayOpacity?: number;
    headingColor?: string;
    headingFontSize?: number;
    headingFontFamily?: string;
    subheadingColor?: string;
    buttonBackgroundColor?: string;
    buttonTextColor?: string;
    buttonBorderRadius?: number;
    contentAlignment?: Alignment;
    verticalAlignment?: "top" | "center" | "bottom";
  };
}

export interface CardBlock extends BaseBlock {
  type: "card";
  data: {
    showIcon: boolean;
    /** "lucide" only survives from imported designs; it renders as the emoji. */
    iconMode: "emoji" | "image" | "lucide";
    iconEmoji: string;
    iconName?: string;
    iconImageSrc: string;
    iconImageAlt: string;
    showBadge: boolean;
    badgeText: string;
    heading: string;
    body: string;
    showButton: boolean;
    buttonText: string;
    buttonUrl: string;
  };
  style: BlockStyle & {
    iconSize?: number;
    iconColor?: string;
    iconBackgroundColor?: string;
    iconBorderRadius?: number;
    badgeBackgroundColor?: string;
    badgeTextColor?: string;
    headingColor?: string;
    headingFontSize?: number;
    headingFontFamily?: string;
    headingFontWeight?: number;
    bodyColor?: string;
    bodyFontSize?: number;
    bodyFontFamily?: string;
    buttonBackgroundColor?: string;
    buttonTextColor?: string;
    buttonBorderRadius?: number;
    buttonFontSize?: number;
    buttonFontFamily?: string;
    buttonFontWeight?: number;
    buttonPaddingX?: number;
    buttonPaddingY?: number;
    buttonFullWidth?: boolean;
    buttonBorderStyle?: "solid" | "dashed" | "dotted";
    buttonBorderColor?: string;
    buttonBorderWidth?: number;
    contentAlignment?: Alignment;
  };
}

export interface ListItem {
  id: string;
  icon: string;
  iconMode?: "text" | "lucide";
  iconName?: string;
  text: string;
  subtitle: string;
}

export interface ListBlock extends BaseBlock {
  type: "list";
  data: { items: ListItem[] };
  style: BlockStyle & {
    iconSize?: number;
    iconColor?: string;
    textColor?: string;
    textFontSize?: number;
    textFontFamily?: string;
    textFontWeight?: number;
    subtitleColor?: string;
    subtitleFontSize?: number;
    spacing?: number;
    layout?: "vertical" | "horizontal";
    contentAlignment?: Alignment;
  };
}

export interface ProfileBlock extends BaseBlock {
  type: "profile";
  data: {
    imageSrc: string;
    imageAlt: string;
    name: string;
    role: string;
    bio: string;
    showBadge: boolean;
    badgeText: string;
  };
  style: BlockStyle & {
    imageSize?: number;
    imageBorderRadius?: number;
    imagePosition?: "left" | "right" | "top";
    nameColor?: string;
    nameFontSize?: number;
    nameFontFamily?: string;
    nameFontWeight?: number;
    roleColor?: string;
    roleFontSize?: number;
    bioColor?: string;
    bioFontSize?: number;
    bioFontFamily?: string;
    badgeBackgroundColor?: string;
    badgeTextColor?: string;
    contentAlignment?: Alignment;
  };
}

/** Her logo and/or name, drawn from the brand kit at render time. */
export interface BrandHeaderBlock extends BaseBlock {
  type: "brandHeader";
  data: { variant: "logo" | "logoName" | "name" | "mark" };
  style: BlockStyle & { logoHeight?: number };
}

/** Name · site, socials, address, a note and the unsubscribe link, from the kit. */
export interface BrandFooterBlock extends BaseBlock {
  type: "brandFooter";
  data: { showSocial: boolean; showAddress: boolean; note: string };
  style: BlockStyle & { fontSize?: number };
}

/** One of her offers (course, class, download, post, plan, page), resolved live
 *  by ref: "course:12", "live:5", "next:event", "latest:course", … */
export interface ItemBlock extends BaseBlock {
  type: "item";
  data: {
    ref: string;
    layout: "card" | "row" | "compact";
    showImage: boolean;
    showSummary: boolean;
    showMeta: boolean;
    buttonText: string;
  };
  style: BlockStyle & {
    titleColor?: string;
    textColor?: string;
    buttonColor?: string;
    buttonTextColor?: string;
  };
}

export type Block =
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | ColumnsBlock
  | SocialBlock
  | HeadingBlock
  | SpacerBlock
  | HtmlBlock
  | HeroBlock
  | CardBlock
  | ListBlock
  | ProfileBlock
  | BrandHeaderBlock
  | BrandFooterBlock
  | ItemBlock;

export interface TemplateSettings {
  backgroundColor: string;
  backgroundStyle?: string;
  bodyBackgroundStyle?: string;
  bodyBackgroundColor?: string;
  contentWidth: number;
  bodyBorderRadius?: number;
  defaultFont: string;
  defaultFontSize: number;
  defaultColor: string;
}

export interface EmailDesign {
  version: number;
  settings: TemplateSettings;
  header: { blocks: Block[] };
  body: { blocks: Block[] };
  footer: { blocks: Block[] };
}

export interface BrandKit {
  name: string;
  site: string;
  host: string;
  /** Her logo (stable URL), "" when she has none. */
  logo: string;
  /** Her square mark (or initial tile). */
  mark: string;
  /** Token name (without "brand:") -> hex. */
  colors: Record<string, string>;
  fonts: { heading: string; body: string };
  radius: number;
  socials: { network: string; url: string }[];
  address: string;
}

export interface CatalogItem {
  /** "course:12", "live:5", … or a live slot ("next:event") the server resolved. */
  ref: string;
  kind: string;
  title: string;
  summary: string;
  image: string;
  url: string;
  /** Price and/or date line. */
  meta: string;
}

export interface ImageValue {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface EditorFeatures {
  items: boolean;
  brand: boolean;
}

/** Where a block goes: a region list, or a column inside a columns block. */
export interface DropTarget {
  region: RegionKey;
  parentId?: string | null;
  columnId?: string | null;
  index?: number;
}
