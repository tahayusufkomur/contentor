import type { Metadata } from 'next'

import { TenantThemeStyle } from '@/components/shared/tenant-theme-style'
import { TenantProvider } from '@/components/shared/tenant-provider'
import { fetchTenantConfig, getTenantSlug } from '@/lib/tenant'

import '@/styles/globals.css'

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
      <body className="font-sans antialiased">
        <TenantProvider config={config}>{children}</TenantProvider>
      </body>
    </html>
  )
}
