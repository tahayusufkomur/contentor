import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonList } from "@/components/ui/skeletons";

export default function LearnLoading() {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[1fr_320px] md:p-6">
      <Skeleton className="aspect-video w-full rounded-lg" />
      <SkeletonList />
    </div>
  );
}
