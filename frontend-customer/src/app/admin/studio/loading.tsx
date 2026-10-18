import { StudioSkeleton } from "@/components/studio/studio-list";
import { SkeletonPageHeader } from "@/components/ui/skeletons";

export default function PhotoStudioLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <StudioSkeleton />
    </div>
  );
}
