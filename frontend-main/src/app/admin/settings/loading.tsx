import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Skeleton className="h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 w-48 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
