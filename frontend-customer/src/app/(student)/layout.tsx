import { requireAuth } from '@/lib/auth'
import { PublicHeader } from '@/components/shared/public-header'

export const dynamic = 'force-dynamic'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  return (
    <>
      <PublicHeader user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">{children}</main>
    </>
  )
}
