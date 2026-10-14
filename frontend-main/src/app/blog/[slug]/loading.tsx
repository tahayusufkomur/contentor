import { Skeleton } from "@/components/ui/skeleton";

export default function BlogPostLoading() {
  return (
    <div className="mx-auto w-full max-w-text px-6 pb-20 pt-10">
      <div className="space-y-3 text-center">
        <Skeleton className="mx-auto h-4 w-24" />
        <Skeleton className="mx-auto h-10 w-3/4" />
        <Skeleton className="mx-auto h-5 w-1/2" />
      </div>
      <Skeleton className="mt-10 aspect-video w-full rounded-tile" />
      <div className="mx-auto mt-12 max-w-[728px] space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
