import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonPageHeader } from "@/components/ui/skeletons";

export default function AdminCalendarLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-md" />
        ))}
      </div>
    </div>
  );
}
