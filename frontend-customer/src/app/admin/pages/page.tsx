import { EmptyState } from '@/components/shared/empty-state'
import { FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function PagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pages</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage custom pages for your site.
        </p>
      </div>
      <EmptyState
        icon={FileText}
        title="Coming soon"
        description="Custom pages are being built. You will be able to create landing pages, about pages, and more."
      />
    </div>
  )
}
