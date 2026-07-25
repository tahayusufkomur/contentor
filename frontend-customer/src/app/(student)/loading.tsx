import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";

export default function StudentLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <SkeletonPageHeader />
      <SkeletonCardGrid />
    </div>
  );
}
