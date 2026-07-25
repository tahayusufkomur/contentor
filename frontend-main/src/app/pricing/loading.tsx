import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/ui/skeletons";

export default function PricingLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-28">
      <SkeletonPageHeader />
      <SkeletonCardGrid count={3} withImage={false} />
    </div>
  );
}
