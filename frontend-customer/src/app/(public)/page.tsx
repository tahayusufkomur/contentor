import Link from 'next/link'
import { fetchTenantConfig, getTenantSlug } from '@/lib/tenant'
import { Button } from '@/components/ui/button'
import { ArrowRight, BookOpen } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const slug = await getTenantSlug()
  const config = await fetchTenantConfig(slug)

  const brandName = config?.brand_name || 'Welcome'
  const description =
    config?.meta_description ||
    'Explore courses, join live classes, and connect with the community.'

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative flex flex-col items-center py-16 text-center md:py-24">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          {brandName}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground md:text-xl">
          {description}
        </p>
        <Button asChild size="lg" className="mt-8 gap-2">
          <Link href="/courses">
            Browse Courses
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      {/* Featured section placeholder */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight">Featured</h2>
        </div>
        <div className="mt-6 rounded-xl border border-dashed bg-brand-surface p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-primary/30" />
          <p className="text-sm text-muted-foreground">
            Featured content coming soon.
          </p>
        </div>
      </section>
    </div>
  )
}
