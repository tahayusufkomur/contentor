import { requireAuth, requireRole } from '@/lib/auth'
import { AdminSidebar } from '@/components/shared/admin-sidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  await requireRole(user, ['owner', 'coach'])
  return (
    <div className="flex h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
