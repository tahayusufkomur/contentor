import {
  SkeletonCardGrid,
  SkeletonPageHeader,
} from "@/components/ui/skeletons";

export default function NewEmailLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonCardGrid count={6} />
    </div>
  );
}
