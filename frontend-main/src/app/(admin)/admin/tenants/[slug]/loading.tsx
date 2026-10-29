import { SkeletonPageHeader, SkeletonForm } from "@/components/ui/skeletons";

export default function TenantDetailLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <SkeletonForm fields={6} />
    </div>
  );
}
