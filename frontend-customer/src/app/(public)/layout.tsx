import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { setupFlowActive } from "@/app/setup/gate";
import { PublicFooter } from "@/components/shared/public-footer";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { serverFetch } from "@/lib/api-server";
import { fetchPublishedPosts } from "@/lib/blog-public";
import { PublicHeader } from "@/components/shared/public-header";
import { EditSidebar } from "@/components/owner/edit-sidebar";
import { SiteAssistantBubble } from "@/components/assistant/site-assistant-bubble";
import { CopilotBubble } from "@/components/copilot/copilot-bubble";
import type { SubscriptionPlan } from "@/types/billing";

export const dynamic = "force-dynamic";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, slug, hdrs] = await Promise.all([
    getAuthUser(),
    getTenantSlug(),
    headers(),
  ]);
  const isAdmin = user?.role === "owner" || user?.role === "coach";
  // ?embed=1 (middleware → x-embed): the /setup preview iframe. Plain site,
  // no owner chrome, no redirect back to /setup.
  const embed = hdrs.get("x-embed") === "1";
  if (isAdmin && !embed && (await setupFlowActive(slug))) redirect("/setup");
  const config = isAdmin && !embed ? await fetchTenantConfig(slug) : null;

  // Public endpoint: a tenant with no active plans hides Pricing/Subscribe.
  let hasSubscription = false;
  let plansEnabled = true; // fail open — a fetch hiccup must not hide the link
  try {
    const plans = await serverFetch<SubscriptionPlan[]>(
      "/api/v1/billing/plans/",
    );
    plansEnabled = plans.length > 0;
    hasSubscription = Boolean(user) && plans.some((p) => p.is_subscribed);
  } catch {}

  const posts = await fetchPublishedPosts();
  const blogEnabled = posts.length > 0;

  // A flex column at least a screen tall: a short page keeps its footer at the bottom.
  const content = (
    <div className="flex min-h-screen flex-col">
      <PublicHeader
        // The /setup preview shows the site as a visitor sees it.
        user={embed ? null : user}
        hasSubscription={hasSubscription}
        plansEnabled={plansEnabled}
        blogEnabled={blogEnabled}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-6">
        {children}
      </main>
      <PublicFooter />
      {!isAdmin && !embed && <SiteAssistantBubble />}
      {isAdmin && !embed && <CopilotBubble />}
    </div>
  );

  if (isAdmin && config) {
    return <EditSidebar initialConfig={config}>{content}</EditSidebar>;
  }

  return content;
}
