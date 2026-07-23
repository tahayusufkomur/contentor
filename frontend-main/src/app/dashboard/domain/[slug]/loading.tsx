import { SkeletonForm, SkeletonPageHeader } from "@/components/ui/skeletons";

export default function DomainWizardLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <SkeletonPageHeader />
      <SkeletonForm fields={2} className="mt-8" />
    </main>
  );
}
