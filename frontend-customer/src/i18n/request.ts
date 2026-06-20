import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { defaultLocale, isValidLocale, regionDefaultLocale, regionFromHost, type Locale } from './config'

export default getRequestConfig(async () => {
  const headerList = await headers()
  const cookieStore = await cookies()

  const cookieLocale = cookieStore.get('user-locale')?.value
  let locale: Locale = defaultLocale

  if (isValidLocale(cookieLocale)) {
    locale = cookieLocale
  } else {
    const host = headerList.get('x-forwarded-host') || headerList.get('host') || ''
    const region = regionFromHost(host)
    locale = regionDefaultLocale(region)
  }

  const [admin, student, common, pwa] = await Promise.all([
    import(`../../messages/${locale}/admin.json`).then(m => m.default),
    import(`../../messages/${locale}/student.json`).then(m => m.default),
    import(`../../messages/${locale}/common.json`).then(m => m.default),
    import(`../../messages/${locale}/pwa.json`).then(m => m.default),
  ])

  return {
    locale,
    messages: { admin, student, common, pwa },
  }
})
