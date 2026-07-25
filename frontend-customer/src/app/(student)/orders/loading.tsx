import {
  SkeletonPageHeader,
  SkeletonList,
} from "@/components/ui/skeletons";

export default function OrdersLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <SkeletonPageHeader />
      <SkeletonList count={3} />
    </div>
  );
}
