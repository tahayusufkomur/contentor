import type { CxSpec } from "@shared/cx/types";
import { STYLE_KITS } from "@/components/sections/all-styles";
import { DEFAULT_KIT } from "@/components/sections/kit-contract";
import type { BlockComponentProps } from "@/lib/blocks/types";
import { SpecRenderer } from "./spec-renderer";

/** Renders a `cx` block with the site style's kit (neutral kit when the
 *  style is unknown or unset). */
export function CxBlock({
  data,
  dynamicData,
  editable,
  styleId,
}: BlockComponentProps) {
  const spec = (data.cx as { spec?: CxSpec } | undefined)?.spec;
  if (!spec?.tree) return null;
  const kit =
    styleId && Object.prototype.hasOwnProperty.call(STYLE_KITS, styleId)
      ? STYLE_KITS[styleId]
      : DEFAULT_KIT;
  return (
    <SpecRenderer
      spec={spec}
      block={data}
      data={dynamicData}
      editable={editable}
      kit={kit}
    />
  );
}
