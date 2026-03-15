'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, CreditCard, Download, LayoutDashboard, Mail, MessageSquare, Palette, FileText, Users, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Courses', href: '/admin/courses', icon: BookOpen },
  { label: 'Downloads', href: '/admin/downloads', icon: Download },
  { label: 'Live Classes', href: '/admin/live', icon: Video },
  { label: 'Students', href: '/admin/students', icon: Users },
  { label: 'Community', href: '/admin/community', icon: MessageSquare },
  { label: 'Pages', href: '/admin/pages', icon: FileText },
  { label: 'Design', href: '/admin/design', icon: Palette },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard },
  { label: 'Campaigns', href: '/admin/campaigns', icon: Mail },
]

export function AdminSidebar() {
  const pathname = usePathname()
  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="border-b p-4"><h2 className="text-lg font-semibold">Admin</h2></div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
