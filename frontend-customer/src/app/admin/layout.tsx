import { requireAuth, requireRole } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  await requireRole(user, ["owner", "coach"]);
  return <AdminShell>{children}</AdminShell>;
}
