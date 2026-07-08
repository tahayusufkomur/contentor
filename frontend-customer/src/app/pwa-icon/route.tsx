import { ImageResponse } from "next/og";

import { getThemePalette } from "@/lib/themes";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const SIZES: Record<string, number> = {
  "32": 32,
  "180": 180,
  "192": 192,
  "512": 512,
};

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const size = SIZES[searchParams.get("size") ?? "512"] ?? 512;
  const maskable = searchParams.get("purpose") === "maskable";
  const version = searchParams.get("v");

  const slug = await getTenantSlug();
  const config = slug !== "__platform__" ? await fetchTenantConfig(slug) : null;
  const theme = getThemePalette(config?.theme);
  const brand = config?.brand_name || "Contentor";
  // Prefer the Logo Studio's square mark; fall back to the wide logo, then
  // to the brand-initial tile.
  const logoUrl = config?.icon_url || config?.logo_url || null;

  // The square mark already contains its own badge background from the Logo
  // Studio composer, so render it edge-to-edge (maskable keeps a small
  // safe-zone margin). The wide-logo fallback keeps the padding tuned for
  // sitting inset on the theme-color tile.
  const pad = config?.icon_url
    ? maskable
      ? Math.round(size * 0.06)
      : 0
    : Math.round(size * (maskable ? 0.12 : 0.06));
  const inner = size - pad * 2;

  const fallback = (
    <div
      style={{
        display: "flex",
        width: inner,
        height: inner,
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontSize: inner * 0.55,
        fontWeight: 700,
      }}
    >
      {brand.charAt(0).toUpperCase()}
    </div>
  );

  // eslint-disable-next-line @next/next/no-img-element
  const logo = logoUrl ? (
    <img
      src={logoUrl}
      width={inner}
      height={inner}
      alt=""
      style={{ objectFit: "contain" }}
    />
  ) : (
    fallback
  );

  const render = (child: React.ReactElement) =>
    new ImageResponse(
      <div
        style={{
          display: "flex",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.primaryHex,
        }}
      >
        {child}
      </div>,
      {
        width: size,
        height: size,
        headers: {
          // Versioned URL (?v=<icon_id or logo_id>) is immutable; unversioned must revalidate.
          "Cache-Control": version
            ? "public, max-age=31536000, immutable"
            : "public, max-age=0, must-revalidate",
        },
      },
    );

  try {
    return render(logo);
  } catch {
    // Logo fetch/format failure (e.g. unsupported SVG/WebP) → brand initial.
    return render(fallback);
  }
}
