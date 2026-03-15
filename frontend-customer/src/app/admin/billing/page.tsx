import { EmptyState } from '@/components/shared/empty-state'
import { CreditCard } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription and payment settings.
        </p>
      </div>
      <EmptyState
        icon={CreditCard}
        title="Coming soon"
        description="Billing management is on the way. You will be able to view invoices, manage subscriptions, and update payment methods."
      />
    </div>
  )
}
