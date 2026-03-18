import { getAuthUser } from "@/lib/auth";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { PublicHeader } from "@/components/shared/public-header";
import { EditSidebar } from "@/components/owner/edit-sidebar";

export const dynamic = "force-dynamic";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, slug] = await Promise.all([getAuthUser(), getTenantSlug()]);
  const isAdmin = user?.role === "owner" || user?.role === "coach";
  const config = isAdmin ? await fetchTenantConfig(slug) : null;

  const content = (
    <>
      <PublicHeader user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </>
  );

  if (isAdmin && config) {
    return <EditSidebar initialConfig={config}>{content}</EditSidebar>;
  }

  return content;
}
