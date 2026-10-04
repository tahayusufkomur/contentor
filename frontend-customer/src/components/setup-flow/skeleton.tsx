import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonList, SkeletonPageHeader } from "@/components/ui/skeletons";
import { SHELL_TOKENS } from "./tokens";

/** The setup shell's shape while the flow loads: rail, stage, chat. */
export function SetupSkeleton() {
  return (
    <div style={SHELL_TOKENS} className="flex h-dvh overflow-hidden">
      <div className="hidden w-[280px] shrink-0 space-y-8 border-r border-[var(--sf-line)] p-6 lg:block">
        <SkeletonPageHeader />
        <SkeletonList count={4} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-5 bg-[var(--sf-wall)] p-4 lg:p-7">
        <SkeletonPageHeader />
        <Skeleton className="min-h-0 flex-1 rounded-[14px] bg-white/70" />
      </div>
      <div className="hidden w-[380px] shrink-0 border-l border-[var(--sf-line)] p-5 lg:block">
        <SkeletonPageHeader />
      </div>
    </div>
  );
}
