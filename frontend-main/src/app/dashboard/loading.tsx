import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <>
      <div className="sticky top-0 z-50">
        <Skeleton className="h-12 w-full rounded-none" />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-28">
        <SkeletonPageHeader />
        <SkeletonCardGrid withImage={false} />
      </div>
    </>
  );
}
