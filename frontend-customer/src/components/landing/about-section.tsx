import type { LandingAbout } from '@/types/tenant'

export function AboutSection({ data }: { data: LandingAbout }) {
  if (!data.enabled) return null
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className={`flex flex-col gap-10 ${data.image_url ? 'md:flex-row md:items-center' : ''}`}>
          <div className="flex-1">
            <h2 className="font-display text-3xl font-bold tracking-tight">{data.heading}</h2>
            {data.body && (
              <p className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-line">
                {data.body}
              </p>
            )}
          </div>
          {data.image_url && (
            <div className="flex-1">
              <img
                src={data.image_url}
                alt={data.heading}
                className="rounded-2xl object-cover w-full max-h-80"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
