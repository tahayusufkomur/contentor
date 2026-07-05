import { requireAuth } from "@/lib/auth";
import { serverFetch } from "@/lib/api-server";
import { ImpersonationBanner } from "@/components/shared/impersonation-banner";
import { PublicHeader } from "@/components/shared/public-header";
import type { SubscriptionPlan } from "@/types/billing";

export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  let hasSubscription = false;
  try {
    const plans = await serverFetch<SubscriptionPlan[]>(
      "/api/v1/billing/plans/",
    );
    hasSubscription = plans.some((p) => p.is_subscribed);
  } catch {}

  return (
    <>
      <PublicHeader user={user} hasSubscription={hasSubscription} />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</main>
      <ImpersonationBanner />
    </>
  );
}
