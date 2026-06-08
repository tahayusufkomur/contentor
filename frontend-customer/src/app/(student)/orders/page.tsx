'use client'

import { useEffect, useState } from 'react'
import { Loader2, Receipt, ExternalLink, ShoppingBag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/shared/empty-state'
import { clientFetch } from '@/lib/api-client'

interface OrderItem {
  id: number
  title: string
  item_price: string
  is_refunded: boolean
}

interface Order {
  id: number
  payment_type: string
  status: string
  amount: string
  currency: string
  created_at: string | null
  receipt_url: string
  items: OrderItem[]
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
  completed: 'success',
  partially_refunded: 'warning',
  refunded: 'secondary',
  pending: 'secondary',
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    clientFetch<Order[]>('/api/v1/billing/orders/')
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Order History</h1>
        <p className="mt-1 text-muted-foreground">Your purchases and receipts.</p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No orders yet"
          description="Your purchases will appear here with their receipts."
          action={{ label: 'Browse store', href: '/store' }}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Card key={o.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base capitalize">
                    {o.payment_type.replace('_', ' ')} · {o.amount} {o.currency}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[o.status] ?? 'secondary'}>{o.status.replace('_', ' ')}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(o.created_at)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {o.items.map((item) => (
                  <p key={item.id} className="flex items-center justify-between text-sm">
                    <span className={item.is_refunded ? 'text-muted-foreground line-through' : ''}>{item.title}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {item.item_price} {o.currency}
                    </span>
                  </p>
                ))}
                {o.receipt_url && (
                  <>
                    <Separator />
                    <Button asChild variant="ghost" size="sm" className="gap-2">
                      <a href={o.receipt_url} target="_blank" rel="noopener noreferrer">
                        <Receipt className="h-4 w-4" /> View receipt
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
