import { SkeletonPageHeader, SkeletonList } from "@/components/ui/skeletons";

export default function FaqLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-12">
      <SkeletonPageHeader />
      <SkeletonList />
    </div>
  );
}
