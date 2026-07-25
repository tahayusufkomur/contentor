import {
  SkeletonPageHeader,
  SkeletonCardGrid,
  SkeletonTable,
} from "@/components/ui/skeletons";

export default function AdminDashboardLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SkeletonPageHeader />
      <SkeletonCardGrid count={4} />
      <SkeletonTable />
    </div>
  );
}
