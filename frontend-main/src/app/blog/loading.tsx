import { SkeletonList, SkeletonPageHeader } from "@/components/ui/skeletons";

export default function BlogLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-20 pt-32">
      <SkeletonPageHeader />
      <SkeletonList count={4} className="mt-8" />
    </div>
  );
}
