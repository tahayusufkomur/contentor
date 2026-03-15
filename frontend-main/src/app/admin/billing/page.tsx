import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function BillingPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Billing</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Billing Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Coming in Sub-project 5</p>
        </CardContent>
      </Card>
    </div>
  )
}
