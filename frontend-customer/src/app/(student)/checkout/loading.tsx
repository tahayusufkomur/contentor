import {
  SkeletonPageHeader,
  SkeletonList,
  SkeletonForm,
} from "@/components/ui/skeletons";

export default function CheckoutLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <SkeletonPageHeader />
      <div className="grid gap-6 lg:grid-cols-3">
        <SkeletonList count={3} className="lg:col-span-2" />
        <SkeletonForm fields={2} />
      </div>
    </div>
  );
}
