import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { lookPrimaryHex } from "@/lib/site-styles";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const slug = await getTenantSlug();
  const [locale, t] = await Promise.all([getLocale(), getTranslations("pwa")]);
  const config = slug !== "__platform__" ? await fetchTenantConfig(slug) : null;
  const themeColor = lookPrimaryHex(config?.style, config?.palette);
  const name = config?.brand_name ?? "Contentor";
  const v = config?.icon_id ?? config?.logo_id ?? "default";

  return {
    id: "/",
    name,
    short_name: name,
    description: config?.meta_description ?? t("manifestDescription"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: locale,
    categories: ["education"],
    background_color: "#ffffff",
    theme_color: themeColor,
    icons: [
      {
        src: `/pwa-icon?size=192&v=${v}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/pwa-icon?size=512&v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/pwa-icon?size=512&purpose=maskable&v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
