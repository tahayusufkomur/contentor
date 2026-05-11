#!/usr/bin/env node
// Translation-parity guard.
// Compares every messages/en/*.json against messages/tr/*.json (and vice versa)
// for two front-end apps; fails with a list of mismatched keys.
//
// Usage:  node scripts/check-i18n-parity.mjs
// Exits 0 on parity, 1 on drift. Intended for CI + pre-commit.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const APPS = [
  { name: 'frontend-main', dir: join(ROOT, 'frontend-main', 'messages') },
  { name: 'frontend-customer', dir: join(ROOT, 'frontend-customer', 'messages') },
]

const LOCALES = ['en', 'tr']

function flatten(obj, prefix = '') {
  const out = new Set()
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const sub of flatten(value, path)) out.add(sub)
    } else {
      out.add(path)
    }
  }
  return out
}

let failed = 0

for (const app of APPS) {
  const namespacesByLocale = new Map()
  for (const locale of LOCALES) {
    const localeDir = join(app.dir, locale)
    try {
      const files = readdirSync(localeDir).filter((f) => f.endsWith('.json'))
      namespacesByLocale.set(locale, new Set(files))
    } catch {
      console.error(`[${app.name}] missing ${localeDir}`)
      failed++
      namespacesByLocale.set(locale, new Set())
    }
  }
  const [enFiles, trFiles] = LOCALES.map((l) => namespacesByLocale.get(l))
  const allFiles = new Set([...enFiles, ...trFiles])

  for (const file of allFiles) {
    const enMissing = !enFiles.has(file)
    const trMissing = !trFiles.has(file)
    if (enMissing || trMissing) {
      console.error(
        `[${app.name}] namespace "${file}" missing in ${enMissing ? 'en' : 'tr'}`,
      )
      failed++
      continue
    }
    const enPath = join(app.dir, 'en', file)
    const trPath = join(app.dir, 'tr', file)
    const enKeys = flatten(JSON.parse(readFileSync(enPath, 'utf8')))
    const trKeys = flatten(JSON.parse(readFileSync(trPath, 'utf8')))

    const onlyInEn = [...enKeys].filter((k) => !trKeys.has(k))
    const onlyInTr = [...trKeys].filter((k) => !enKeys.has(k))
    if (onlyInEn.length || onlyInTr.length) {
      console.error(`[${app.name}/${file}] key drift:`)
      for (const k of onlyInEn) console.error(`  only in en: ${k}`)
      for (const k of onlyInTr) console.error(`  only in tr: ${k}`)
      failed++
    }
  }
}

if (failed) {
  console.error(`\nTranslation parity check FAILED with ${failed} issue(s).`)
  process.exit(1)
}
console.log('Translation parity OK.')
