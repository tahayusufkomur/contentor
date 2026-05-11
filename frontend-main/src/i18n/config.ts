// Locale + region resolution from request host.
// Source of truth for "what language does this host serve?"
// TR: needs native review for all translated strings.

export const locales = ['en', 'tr'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

const TR_APEX_HOSTS = new Set([
  'tr.contentor.app',
  'tr.contentor.localhost',
  'tr.localhost',
])

export type Region = 'global' | 'tr'

export interface HostInfo {
  region: Region
  locale: Locale
  apex: string
  otherApex: string
}

function stripPort(host: string): string {
  return (host || '').split(':')[0].toLowerCase()
}

export function resolveHost(host: string): HostInfo {
  const h = stripPort(host)

  // TR apex match
  if (TR_APEX_HOSTS.has(h)) {
    return {
      region: 'tr',
      locale: 'tr',
      apex: h,
      otherApex: trToGlobalApex(h),
    }
  }
  // TR subdomain (<slug>.tr.contentor.*)
  if (TR_APEX_HOSTS.has(h.split('.').slice(-3).join('.'))) {
    return {
      region: 'tr',
      locale: 'tr',
      apex: h.split('.').slice(-3).join('.'),
      otherApex: trToGlobalApex(h.split('.').slice(-3).join('.')),
    }
  }

  return {
    region: 'global',
    locale: 'en',
    apex: globalApexFromHost(h),
    otherApex: globalToTrApex(h),
  }
}

function trToGlobalApex(apex: string): string {
  if (apex === 'tr.contentor.app') return 'contentor.app'
  if (apex === 'tr.contentor.localhost') return 'contentor.localhost'
  if (apex === 'tr.localhost') return 'localhost'
  return apex.replace(/^tr\./, '')
}

function globalToTrApex(host: string): string {
  // host may be `contentor.app`, `localhost`, or `<slug>.contentor.app`
  if (host === 'contentor.app' || host.endsWith('.contentor.app')) return 'tr.contentor.app'
  if (host === 'contentor.localhost' || host.endsWith('.contentor.localhost')) return 'tr.contentor.localhost'
  if (host === 'localhost') return 'tr.localhost'
  return host
}

function globalApexFromHost(host: string): string {
  if (host.endsWith('contentor.app')) return 'contentor.app'
  if (host.endsWith('contentor.localhost')) return 'contentor.localhost'
  return 'localhost'
}

export function otherLocaleUrl(currentHost: string, currentPath: string, scheme = 'http'): string {
  const { otherApex } = resolveHost(currentHost)
  return `${scheme}://${otherApex}${currentPath}`
}
