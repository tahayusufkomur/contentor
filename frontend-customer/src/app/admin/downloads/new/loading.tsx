import { SkeletonForm, SkeletonPageHeader } from "@/components/ui/skeletons";

export default function NewDownloadLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonForm fields={5} />
    </div>
  );
}
