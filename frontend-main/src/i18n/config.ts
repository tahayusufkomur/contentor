// Locale + region resolution from request host.
// Source of truth for "what language does this host serve?"
// TR: needs native review for all translated strings.

export const locales = ['en', 'tr'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

// Apex pairs: each entry is [globalApex, trApex]. New deployments need only
// to add a new pair (e.g. eu.contentor.app / tr.eu.contentor.app).
const APEX_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['contentor.app', 'tr.contentor.app'],
  ['localhost', 'tr.localhost'],
]
const TR_APEX_HOSTS = new Set(APEX_PAIRS.map(([, tr]) => tr))
const GLOBAL_APEX_HOSTS = new Set(APEX_PAIRS.map(([g]) => g))

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
    return { region: 'tr', locale: 'tr', apex: h, otherApex: trToGlobalApex(h) }
  }
  // TR subdomain — any host ending in `.<trApex>`
  for (const trApex of TR_APEX_HOSTS) {
    if (h.endsWith(`.${trApex}`)) {
      return { region: 'tr', locale: 'tr', apex: trApex, otherApex: trToGlobalApex(trApex) }
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
  for (const [g, tr] of APEX_PAIRS) {
    if (apex === tr) return g
  }
  return apex.replace(/^tr\./, '')
}

function globalToTrApex(host: string): string {
  for (const [g, tr] of APEX_PAIRS) {
    if (host === g || host.endsWith(`.${g}`)) return tr
  }
  return host
}

function globalApexFromHost(host: string): string {
  for (const g of GLOBAL_APEX_HOSTS) {
    if (host === g || host.endsWith(`.${g}`)) return g
  }
  return 'localhost'
}

export function otherLocaleUrl(currentHost: string, currentPath: string, scheme = 'http'): string {
  const { otherApex } = resolveHost(currentHost)
  return `${scheme}://${otherApex}${currentPath}`
}
