import { EmptyState } from '@/components/shared/empty-state'
import { Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Students</h1>
        <p className="text-sm text-muted-foreground">
          View and manage your enrolled students.
        </p>
      </div>
      <EmptyState
        icon={Users}
        title="Coming soon"
        description="Student management is on the way. You will be able to view enrollment data, track progress, and communicate with your students."
      />
    </div>
  )
}
