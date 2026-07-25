import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";

export default function PublicLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-12">
      <SkeletonPageHeader />
      <SkeletonCardGrid />
    </div>
  );
}
