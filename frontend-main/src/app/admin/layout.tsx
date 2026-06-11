import { requireSuperuser } from '@/lib/auth'
import { AdminShell } from './admin-shell'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperuser()
  return <AdminShell>{children}</AdminShell>
}
