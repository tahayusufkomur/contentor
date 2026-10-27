import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { setupFlowActive } from "@/app/setup/gate";
import { PublicFooter } from "@/components/shared/public-footer";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { serverFetch } from "@/lib/api-server";
import { fetchPublishedPosts } from "@/lib/blog-public";
import { PublicHeader } from "@/components/shared/public-header";
import { StickyCta } from "@/components/shared/sticky-cta";
import { SiteMotion } from "@/components/shared/site-motion";
import { EditSidebar } from "@/components/owner/edit-sidebar";
import { SiteAssistantBubble } from "@/components/assistant/site-assistant-bubble";
import { CopilotBubble } from "@/components/copilot/copilot-bubble";
import type { SubscriptionPlan } from "@/types/billing";
import type { SiteMenu } from "@/lib/navbar";

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
  // no owner chrome, no redirect back to /setup. ?embed=edit is the same
  // frame with the full editor, for an owner/coach only — anyone else just
  // gets the plain preview.
  const embed = hdrs.get("x-embed");
  const editing = embed === "edit" && isAdmin;
  if (isAdmin && !embed && (await setupFlowActive(slug))) redirect("/setup");
  const config =
    isAdmin && (!embed || editing) ? await fetchTenantConfig(slug) : null;

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

  // Courses and Events links hide when nothing is behind them; fail open.
  const menu = await serverFetch<SiteMenu>("/api/v1/site/menu/").catch(
    () => undefined,
  );

  const posts = await fetchPublishedPosts();
  const blogEnabled = posts.length > 0;

  // A flex column at least a screen tall: a short page keeps its footer at the bottom.
  const content = (
    <div className="flex min-h-screen flex-col">
      <SiteMotion />
      <PublicHeader
        // The /setup preview shows the site as a visitor sees it.
        user={embed ? null : user}
        hasSubscription={hasSubscription}
        plansEnabled={plansEnabled}
        menu={menu}
        blogEnabled={blogEnabled}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-6">
        {children}
      </main>
      <PublicFooter plansEnabled={plansEnabled} menu={menu} />
      {/* The header button, pinned on phones: a visitor's, like the header's. */}
      {(embed || !user) && (
        <StickyCta plansEnabled={plansEnabled} menu={menu} />
      )}
      {!isAdmin && !embed && <SiteAssistantBubble />}
      {isAdmin && !embed && <CopilotBubble />}
    </div>
  );

  if (isAdmin && config) {
    return (
      <EditSidebar initialConfig={config} embedded={editing}>
        {content}
      </EditSidebar>
    );
  }

  return content;
}
