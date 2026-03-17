'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LandingFaq } from '@/types/tenant'

export function FaqSection({ data }: { data: LandingFaq }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!data.enabled || !data.items?.length) return null
  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="font-display text-3xl font-bold tracking-tight text-center mb-10">
          {data.heading}
        </h2>
        <div className="space-y-2">
          {data.items.map((item, i) => (
            <div key={i} className="rounded-lg border bg-background overflow-hidden">
              <button
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-accent/50"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0', open === i && 'rotate-180')}
                />
              </button>
              {open === i && (
                <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
