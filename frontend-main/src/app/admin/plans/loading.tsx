import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function PlansLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Skeleton className="h-8 w-20" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="mt-2 h-8 w-16" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4, 5].map((j) => (
                <Skeleton key={j} className="h-5 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
