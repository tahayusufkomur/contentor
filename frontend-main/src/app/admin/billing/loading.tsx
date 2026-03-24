import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function BillingLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-3 py-8">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
