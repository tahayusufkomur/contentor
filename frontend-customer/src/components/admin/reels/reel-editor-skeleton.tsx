import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonForm, SkeletonPageHeader } from "@/components/ui/skeletons";

/** The reel editor while it loads, in its shape: the header, the 9:16 preview and the settings beside it. */
export function ReelEditorSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Skeleton className="mx-auto aspect-[9/16] w-full max-w-[340px] rounded-xl" />
        <SkeletonForm />
      </div>
    </div>
  );
}
