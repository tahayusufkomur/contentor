import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the dashboard page: header bar, the title block on paper, then
 * the full-bleed muted band holding the cards. */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="sticky top-0 z-50">
        <Skeleton className="h-12 w-full rounded-none" />
      </div>
      <section className="px-6 pb-12 pt-20 md:pt-24">
        <div className="mx-auto max-w-6xl">
          <SkeletonPageHeader />
        </div>
      </section>
      <section className="flex-1 bg-muted px-6 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <SkeletonCardGrid withImage={false} />
        </div>
      </section>
    </div>
  );
}
