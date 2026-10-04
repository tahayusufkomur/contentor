import { redirect } from "next/navigation";
import { requireAuth, requireRole } from "@/lib/auth";
import { getTenantSlug } from "@/lib/tenant";
import { setupFlowActive } from "@/app/setup/gate";
import { AdminShell } from "@/components/admin/admin-shell";
import { CopilotBubble } from "@/components/copilot/copilot-bubble";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  await requireRole(user, ["owner", "coach"]);
  // Guided onboarding owns the coach until it ends.
  if (await setupFlowActive(await getTenantSlug())) redirect("/setup");
  return (
    <>
      <AdminShell user={user}>{children}</AdminShell>
      <CopilotBubble />
    </>
  );
}
