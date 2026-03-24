import { Skeleton } from '@/components/ui/skeleton'

export default function PricingLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header placeholder */}
      <div className="sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Skeleton className="h-5 w-24" />
          <div className="hidden items-center gap-6 md:flex">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="px-6 pb-16 pt-32 md:pt-40">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <Skeleton className="h-10 w-80 md:h-12" />
          <Skeleton className="h-5 w-64" />
        </div>
      </section>

      {/* Plan cards */}
      <section className="px-6 pb-32">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-6">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="mt-4 h-10 w-24" />
              <Skeleton className="mt-2 h-4 w-full" />
              <div className="mt-6 space-y-3">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
              <Skeleton className="mt-8 h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
