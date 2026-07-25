import {
  SkeletonPageHeader,
  SkeletonTable,
} from "@/components/ui/skeletons";

export default function AdminLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <SkeletonTable />
    </div>
  );
}
