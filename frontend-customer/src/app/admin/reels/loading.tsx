import { ReelsSkeleton } from "@/components/admin/reels/reels-home";
import { SkeletonPageHeader } from "@/components/ui/skeletons";

export default function ReelsLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <ReelsSkeleton />
    </div>
  );
}
