import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function TenantDetailLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <Skeleton className="h-4 w-40" />
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
