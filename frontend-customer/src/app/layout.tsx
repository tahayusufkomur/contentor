import type { Metadata } from 'next'
import { Instrument_Sans } from 'next/font/google'

import { TenantThemeStyle } from '@/components/shared/tenant-theme-style'
import { TenantProvider } from '@/components/shared/tenant-provider'
import { ThemeProvider } from '@/components/shared/theme-provider'
import { fetchTenantConfig, getTenantSlug } from '@/lib/tenant'

import '@/styles/globals.css'

const instrumentSans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getTenantSlug()
  const config = await fetchTenantConfig(slug)

  return {
    title: config?.brand_name || 'Welcome',
    description: config?.meta_description || '',
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const slug = await getTenantSlug()
  const config = await fetchTenantConfig(slug)

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {config && <TenantThemeStyle config={config} />}
        {config?.font_family && (
          <link
            href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(config.font_family)}&display=swap`}
            rel="stylesheet"
          />
        )}
      </head>
      <body className={`${instrumentSans.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TenantProvider config={config}>{children}</TenantProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
