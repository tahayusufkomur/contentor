// The native email editor (spec: docs/superpowers/specs/2026-10-22-native-email-design.md).
export { EmailEditor } from "./email-editor";
export type { EmailEditorProps } from "./email-editor";
export { useBlockLabel } from "./blocks/helpers";
export { blankDesign, createBlock } from "./factory";
export {
  EMPTY_DESIGN,
  designHasContent,
  mintBlockId,
  normalizeDesign,
  resolveDesign,
} from "./tree";
export type {
  Block,
  BlockType,
  BrandKit,
  CatalogItem,
  EditorFeatures,
  EmailDesign,
  ImageValue,
  RegionKey,
  TemplateSettings,
} from "./types";
