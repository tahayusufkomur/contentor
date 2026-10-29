import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";

export default function HealthLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <SkeletonCardGrid count={3} withImage={false} />
    </div>
  );
}
