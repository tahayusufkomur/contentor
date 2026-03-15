import { CreditCard } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'

export default function BillingPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">Manage billing and payment information.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={CreditCard}
            title="Billing coming soon"
            description="Billing management will be available in a future release. Stay tuned for invoices, payment methods, and usage reports."
          />
        </CardContent>
      </Card>
    </div>
  )
}
