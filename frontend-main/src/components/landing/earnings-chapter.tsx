import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { EarningsCalculator } from "@/components/landing/earnings-calculator";
import { Chapter } from "@/components/motion/chapter";
import { NavLink } from "@/components/ui/nav-link";
import { Skeleton } from "@/components/ui/skeleton";
import { planTerms } from "@/lib/earnings";
import { fetchPlans } from "@/lib/plans-server";

/** The calculator on the live fees and plan prices; when Django does not
 * answer it points to the pricing page instead of guessing numbers. */
async function Calculator() {
  const [t, data] = await Promise.all([
    getTranslations("marketing.earnings"),
    fetchPlans(),
  ]);
  const terms = planTerms(data);
  if (!terms)
    return (
      <p className="px-6 text-center text-body text-muted-foreground">
        <NavLink
          href="/pricing"
          className="text-marketing-accent hover:underline"
        >
          {t("fallback")}
        </NavLink>
      </p>
    );
  return <EarningsCalculator terms={terms} currency={data!.currency} />;
}

/** "What you could earn": the coach's own students and price, after our fee. */
export async function EarningsChapter() {
  const t = await getTranslations("marketing.earnings");
  return (
    <Chapter
      id="earnings"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <Suspense
        fallback={
          <Skeleton className="mx-6 h-[420px] rounded-tile md:mx-auto md:max-w-text" />
        }
      >
        <Calculator />
      </Suspense>
    </Chapter>
  );
}
