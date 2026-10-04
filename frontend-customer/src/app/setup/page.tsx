import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { redirect } from "next/navigation";
import { SetupFlow } from "@/components/setup-flow/setup-flow";
import { requireAuth, requireRole } from "@/lib/auth";
import {
  fetchTenantConfig,
  getTenantDomain,
  getTenantSlug,
} from "@/lib/tenant";

// The shell's own UI face — deliberately not the coach's site font.
const ui = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-setup",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your site" };

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await requireAuth();
  await requireRole(user, ["owner", "coach"]);
  const [slug, host] = await Promise.all([getTenantSlug(), getTenantDomain()]);
  const config = await fetchTenantConfig(slug);
  // Dev-only fixture so the layout can be checked without the backend.
  const mock =
    process.env.NODE_ENV !== "production" && searchParams.mock === "1";
  // Finished (or never-guided) tenants have nothing to do here.
  if (!mock && config?.setup_flow_active === false) redirect("/admin");

  return (
    <SetupFlow
      brandName={config?.brand_name ?? ""}
      logoUrl={config?.logo_url ?? ""}
      host={host}
      mock={mock}
      fontClassName={ui.variable}
    />
  );
}
