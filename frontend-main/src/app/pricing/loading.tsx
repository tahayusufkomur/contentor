import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function PricingLoading() {
  return (
    <>
      <div className="sticky top-0 z-50 px-4 pt-4">
        <Skeleton className="mx-auto h-14 max-w-6xl rounded-full" />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-28">
        <SkeletonPageHeader />
        <SkeletonCardGrid count={3} withImage={false} />
      </div>
    </>
  );
}
