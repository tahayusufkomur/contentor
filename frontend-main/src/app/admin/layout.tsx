import { requireSuperuser } from '@/lib/auth'
import { AppSidebar } from '@/components/shared/app-sidebar'
import { MobileHeader } from '@/components/shared/mobile-header'
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  Activity,
  Receipt,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Tenants', href: '/admin/tenants', icon: Building2 },
  { label: 'Plans', href: '/admin/plans', icon: CreditCard },
  { label: 'Billing', href: '/admin/billing', icon: Receipt },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
  { label: 'Health', href: '/admin/health', icon: Activity },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperuser()
  return (
    <div className="flex h-screen">
      <AppSidebar title="Contentor" navItems={navItems} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title="Contentor" navItems={navItems} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
