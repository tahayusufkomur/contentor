'use client'

import { AppSidebar } from '@/components/shared/app-sidebar'
import { MobileHeader } from '@/components/shared/mobile-header'
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Database,
  Settings,
  Activity,
  Receipt,
  Webhook,
} from 'lucide-react'

// Nav lives in a client component: icon components are functions and can't
// cross the server→client boundary from the (server) layout.
const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Tenants', href: '/admin/tenants', icon: Building2 },
  { label: 'Plans', href: '/admin/plans', icon: CreditCard },
  { label: 'Billing', href: '/admin/billing', icon: Receipt },
  { label: 'Webhooks', href: '/admin/webhooks', icon: Webhook },
  { label: 'Data', href: '/admin/m', icon: Database },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
  { label: 'Health', href: '/admin/health', icon: Activity },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
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
