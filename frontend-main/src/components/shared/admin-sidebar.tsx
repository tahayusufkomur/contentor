'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, CreditCard, Settings, Activity, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Tenants', href: '/admin/tenants', icon: Building2 },
  { label: 'Plans', href: '/admin/plans', icon: CreditCard },
  { label: 'Billing', href: '/admin/billing', icon: Receipt },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
  { label: 'Health', href: '/admin/health', icon: Activity },
]

export function AdminSidebar() {
  const pathname = usePathname()
  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">Platform Admin</h2>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
