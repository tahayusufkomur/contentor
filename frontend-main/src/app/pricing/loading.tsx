import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeletons";

export default function PricingLoading() {
  return (
    <>
      <div className="sticky top-0 z-50">
        <Skeleton className="h-12 w-full rounded-none" />
      </div>
      <div className="mx-auto max-w-text space-y-10 px-6 py-24">
        <SkeletonPageHeader className="mx-auto w-fit" />
        <SkeletonTable rows={9} cols={4} />
      </div>
    </>
  );
}
