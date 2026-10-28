import { redirect } from "next/navigation";
import { SurfaceIntl } from "@/i18n/surface-provider";
import { requireAuth, requireRole } from "@/lib/auth";
import { getTenantSlug } from "@/lib/tenant";
import { setupFlowActive, sitePaused } from "@/app/setup/gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { PausedPlanPicker } from "@/components/admin/paused-plan-picker";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  await requireRole(user, ["owner", "coach"]);
  const slug = await getTenantSlug();
  // Guided onboarding owns the coach until it ends.
  if (await setupFlowActive(slug)) redirect("/setup");
  return (
    <SurfaceIntl>
      <AdminShell user={user}>
        {(await sitePaused(slug)) ? <PausedPlanPicker /> : children}
      </AdminShell>
    </SurfaceIntl>
  );
}
