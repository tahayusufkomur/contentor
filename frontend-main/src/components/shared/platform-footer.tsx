'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Wordmark } from '@/components/shared/logo-mark'

export function PlatformFooter() {
  const t = useTranslations('common.footer')
  const tNav = useTranslations('common.nav')

  const sections = [
    {
      heading: t('product'),
      links: [
        { label: tNav('features'), href: '/#features' },
        { label: tNav('pricing'), href: '/pricing' },
        { label: tNav('getStarted'), href: '/signup' },
      ],
    },
    {
      heading: t('company'),
      links: [
        { label: t('about'), href: '#' },
        { label: t('contact'), href: '#' },
      ],
    },
    {
      heading: t('legal'),
      links: [
        { label: t('privacy'), href: '#' },
        { label: t('terms'), href: '#' },
      ],
    },
  ]

  return (
    <footer className="relative mt-32 border-t bg-background">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center">
              <Wordmark className="text-base" />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('tagline')}</p>
          </div>

          {sections.map((section) => (
            <div key={section.heading}>
              <p className="text-eyebrow text-muted-foreground">{section.heading}</p>
              <ul className="mt-4 space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  )
}

function LanguageSwitcher() {
  const t = useTranslations('common.footer')
  // The other-locale URL is derived from window.location, which only exists in the
  // browser. Compute it after mount so the server and the first client render produce
  // identical markup (the <a> with no href) — branching on `typeof window` during render
  // made the server emit nothing and the client an <a>, causing a hydration mismatch.
  const [otherUrl, setOtherUrl] = useState<string | undefined>(undefined)
  useEffect(() => {
    const host = window.location.host
    const otherHost = host.startsWith('tr.') ? host.replace(/^tr\./, '') : `tr.${host}`
    setOtherUrl(`${window.location.protocol}//${otherHost}${window.location.pathname}`)
  }, [])
  return (
    <a
      href={otherUrl}
      className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {t('switchLanguage')}
    </a>
  )
}
