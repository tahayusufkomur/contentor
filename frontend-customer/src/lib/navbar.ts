// Pure navbar presentation rules, split out of public-header.tsx so they
// are unit-testable (the header itself has no component-test harness).
import type { NavbarLogoSize } from "@/types/tenant";

const SIZE_CLASS: Record<NavbarLogoSize, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
  xl: "h-12",
};

/** Navbar logo height class. The pill capsule is only 56px tall, so xl
 * renders as lg there. Unknown/missing sizes render as md (today's 32px). */
export function logoSizeClass(
  size: NavbarLogoSize | undefined,
  layout: string,
): string {
  const effective: NavbarLogoSize = size && size in SIZE_CLASS ? size : "md";
  if (layout === "pill" && effective === "xl") return SIZE_CLASS.lg;
  return SIZE_CLASS[effective];
}

/** Brand-name text shows when there is no logo image, or when the coach
 * explicitly re-enabled it — saved studio logos already contain the
 * wordmark, so rendering the name next to them duplicated it. */
export function showBrandName(
  config: {
    logo_url?: string | null;
    navbar_config?: { show_brand_name?: boolean };
  } | null,
): boolean {
  if (!config?.logo_url) return true;
  return config.navbar_config?.show_brand_name === true;
}
