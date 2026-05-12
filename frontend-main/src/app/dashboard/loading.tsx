import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="sticky top-0 z-50 px-4 pt-4">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border border-border/40 bg-background/40 px-5 backdrop-blur-md">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>

      <section className="px-6 pb-12 pt-28 md:pt-32">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-12 w-80 md:h-16" />
          <Skeleton className="mt-4 h-5 w-96" />
        </div>
      </section>

      <section className="px-6 pb-32">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-3xl border border-border/40 bg-card/40 p-7 backdrop-blur-md"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-12 w-12 rounded-2xl" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-5 h-6 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/2" />
              <Skeleton className="mt-7 h-9 w-36 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
