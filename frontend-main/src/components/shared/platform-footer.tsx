'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

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
    <footer className="border-t border-primary/20 bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <p className="text-lg font-bold tracking-tight text-background">Contentor</p>
            <p className="mt-2 text-sm text-background/60">{t('tagline')}</p>
          </div>

          {sections.map((section) => (
            <div key={section.heading}>
              <p className="mb-3 text-sm font-semibold text-background">{section.heading}</p>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-background/60 transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="my-8 h-px bg-background/10" />

        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-background/60">
            {t('copyright', { year: new Date().getFullYear() })}
          </p>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  )
}

function LanguageSwitcher() {
  const t = useTranslations('common.footer')
  // The switcher is a cross-domain anchor — we read window.location at render time on the client.
  if (typeof window === 'undefined') return null
  const host = window.location.host
  const path = window.location.pathname
  // Derive the "other" apex by toggling tr. prefix
  const otherHost = host.startsWith('tr.')
    ? host.replace(/^tr\./, '')
    : `tr.${host}`
  const otherUrl = `${window.location.protocol}//${otherHost}${path}`
  return (
    <a
      href={otherUrl}
      className="text-sm text-background/60 transition-colors hover:text-primary underline-offset-2 hover:underline"
    >
      {t('switchLanguage')}
    </a>
  )
}
