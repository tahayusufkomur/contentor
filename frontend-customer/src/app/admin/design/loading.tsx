import { SkeletonPageHeader } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditorLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-[60vh] w-full rounded-lg" />
        <Skeleton className="h-[60vh] w-full rounded-lg" />
      </div>
    </div>
  );
}
