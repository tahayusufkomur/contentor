import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import type { LandingHero } from '@/types/tenant'

export function HeroSection({ data }: { data: LandingHero }) {
  if (!data.enabled) return null
  return (
    <section
      className="relative flex min-h-[60vh] flex-col items-center justify-center py-20 text-center"
      style={data.bg_image_url ? { backgroundImage: `url(${data.bg_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {data.bg_image_url && <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />}
      <div className="relative z-10 mx-auto max-w-3xl px-4">
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          {data.headline}
        </h1>
        {data.subheadline && (
          <p className="mt-5 text-lg text-muted-foreground md:text-xl">{data.subheadline}</p>
        )}
        {data.cta_text && data.cta_href && (
          <Button asChild size="lg" className="mt-8 gap-2">
            <Link href={data.cta_href}>
              {data.cta_text}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  )
}
