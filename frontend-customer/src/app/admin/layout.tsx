import { requireAuth, requireRole } from '@/lib/auth'
import { AppSidebar } from '@/components/shared/app-sidebar'
import { MobileHeader } from '@/components/shared/mobile-header'
import {
  BookOpen,
  CreditCard,
  Download,
  LayoutDashboard,
  Palette,
  FileText,
  Users,
  Video,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Courses', href: '/admin/courses', icon: BookOpen },
  { label: 'Downloads', href: '/admin/downloads', icon: Download },
  { label: 'Live Classes', href: '/admin/live', icon: Video },
  { label: 'Students', href: '/admin/students', icon: Users },
  { label: 'Pages', href: '/admin/pages', icon: FileText },
  { label: 'Design', href: '/admin/design', icon: Palette },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  await requireRole(user, ['owner', 'coach'])
  return (
    <div className="flex h-screen">
      <AppSidebar title="Admin" navItems={navItems} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader title="Admin" navItems={navItems} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
