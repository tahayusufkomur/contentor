'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { LogoMark } from '@/components/shared/logo-mark'

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
    <footer className="relative mt-32 border-t border-border/60 bg-background">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <LogoMark size={32} />
              <span className="text-[16px] font-semibold tracking-[-0.02em]">Contentor</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('tagline')}</p>
          </div>

          {sections.map((section) => (
            <div key={section.heading}>
              <p className="text-eyebrow text-muted-foreground/80">{section.heading}</p>
              <ul className="mt-4 space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13.5px] text-foreground/70 transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  )
}

function LanguageSwitcher() {
  const t = useTranslations('common.footer')
  if (typeof window === 'undefined') return null
  const host = window.location.host
  const path = window.location.pathname
  const otherHost = host.startsWith('tr.')
    ? host.replace(/^tr\./, '')
    : `tr.${host}`
  const otherUrl = `${window.location.protocol}//${otherHost}${path}`
  return (
    <a
      href={otherUrl}
      className="rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-[12.5px] text-foreground/70 backdrop-blur-md transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
    >
      {t('switchLanguage')}
    </a>
  )
}
