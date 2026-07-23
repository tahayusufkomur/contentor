import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonPageHeader } from "@/components/ui/skeletons";

export default function BlogPostLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-20 pt-32">
      <SkeletonPageHeader />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
