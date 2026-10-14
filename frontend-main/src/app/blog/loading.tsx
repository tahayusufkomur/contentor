import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCardGrid } from "@/components/ui/skeletons";

export default function BlogLoading() {
  return (
    <div className="mx-auto w-full max-w-media px-6 pb-20 pt-10">
      <Skeleton className="h-4 w-12" />
      <Skeleton className="mt-6 aspect-video w-full rounded-tile" />
      <div className="mx-auto mt-8 max-w-text space-y-3">
        <Skeleton className="mx-auto h-10 w-2/3" />
        <Skeleton className="mx-auto h-4 w-1/2" />
      </div>
      <SkeletonCardGrid className="mt-20" />
    </div>
  );
}
