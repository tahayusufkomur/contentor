import { Skeleton } from "@/components/ui/skeleton";
import {
  SkeletonCardGrid,
  SkeletonPageHeader,
} from "@/components/ui/skeletons";

/** The studio while a reel loads, in its shape: the top bar, the panels beside the player, the timeline. */
export function VideoStudioSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:h-full lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_244px]">
      <div className="flex items-center gap-3 border-b pb-4 lg:col-span-2 lg:px-4 lg:py-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="ml-auto h-8 w-32" />
      </div>
      <div className="hidden space-y-3 border-r p-4 lg:block">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="flex h-[58vh] items-center justify-center bg-muted/50 p-4 lg:h-auto">
        <Skeleton className="aspect-[9/16] h-full max-h-full rounded-xl" />
      </div>
      <div className="space-y-2 border-t p-3 lg:col-span-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}

/** The studio's list of reels while it loads. */
export function VideoStudioListSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonCardGrid />
    </div>
  );
}
