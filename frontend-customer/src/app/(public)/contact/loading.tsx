import { SkeletonPageHeader, SkeletonForm } from "@/components/ui/skeletons";

export default function ContactLoading() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-12">
      <SkeletonPageHeader />
      <SkeletonForm />
    </div>
  );
}
