import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonForm, SkeletonPageHeader } from "@/components/ui/skeletons";

export default function SendEmailLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <SkeletonForm />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    </div>
  );
}
