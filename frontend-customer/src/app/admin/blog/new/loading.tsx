import { SkeletonForm } from "@/components/ui/skeletons";

export default function NewPostLoading() {
  return <SkeletonForm fields={4} className="mx-auto max-w-3xl p-6" />;
}
