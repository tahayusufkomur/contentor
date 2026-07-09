import { getAuthUser } from "@/lib/auth";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { serverFetch } from "@/lib/api-server";
import { fetchPublishedPosts } from "@/lib/blog-public";
import { PublicHeader } from "@/components/shared/public-header";
import { EditSidebar } from "@/components/owner/edit-sidebar";
import type { SubscriptionPlan } from "@/types/billing";

export const dynamic = "force-dynamic";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, slug] = await Promise.all([getAuthUser(), getTenantSlug()]);
  const isAdmin = user?.role === "owner" || user?.role === "coach";
  const config = isAdmin ? await fetchTenantConfig(slug) : null;

  let hasSubscription = false;
  if (user) {
    try {
      const plans = await serverFetch<SubscriptionPlan[]>(
        "/api/v1/billing/plans/",
      );
      hasSubscription = plans.some((p) => p.is_subscribed);
    } catch {}
  }

  const posts = await fetchPublishedPosts();
  const blogEnabled = posts.length > 0;

  const content = (
    <>
      <PublicHeader
        user={user}
        hasSubscription={hasSubscription}
        blogEnabled={blogEnabled}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </>
  );

  if (isAdmin && config) {
    return <EditSidebar initialConfig={config}>{content}</EditSidebar>;
  }

  return content;
}
