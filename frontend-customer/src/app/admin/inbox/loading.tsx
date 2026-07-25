import { SkeletonList } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminInboxLoading() {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[320px_1fr] md:p-6">
      <SkeletonList />
      <Skeleton className="h-[60vh] w-full rounded-lg" />
    </div>
  );
}
