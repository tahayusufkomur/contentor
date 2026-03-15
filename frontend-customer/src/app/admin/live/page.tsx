import { EmptyState } from '@/components/shared/empty-state'
import { Video } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function LiveClassesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live Classes</h1>
        <p className="text-sm text-muted-foreground">
          Host live sessions with your students.
        </p>
      </div>
      <EmptyState
        icon={Video}
        title="Coming soon"
        description="Live classes are being built. You will be able to schedule and host live sessions with your students."
      />
    </div>
  )
}
