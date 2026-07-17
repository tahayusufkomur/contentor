import { requireSuperuser } from "@/lib/auth";
import { AdminShell } from "./admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSuperuser();
  return (
    <AdminShell user={{ name: user.name, email: user.email }}>
      {children}
    </AdminShell>
  );
}
