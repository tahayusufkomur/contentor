import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonPageHeader } from "@/components/ui/skeletons";

export default function AboutLoading() {
  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-12">
      <SkeletonPageHeader />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
