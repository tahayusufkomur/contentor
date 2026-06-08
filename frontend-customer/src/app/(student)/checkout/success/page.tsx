'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { clientFetch } from '@/lib/api-client'
import { clearCart } from '@/lib/cart'

interface PaymentStatus {
  payment_id: number
  status: string
}

// Mirror the M1 platform-checkout pattern: poll ~30s for the webhook to mark
// the payment completed, then clear the cart and send the buyer to their content.
const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 15

function SuccessInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paymentId = searchParams.get('payment_id')
  const [state, setState] = useState<'polling' | 'done' | 'pending'>('polling')
  const cleared = useRef(false)

  useEffect(() => {
    if (!paymentId) {
      setState('pending')
      return
    }
    let polls = 0
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      polls += 1
      try {
        const data = await clientFetch<PaymentStatus>(`/api/v1/billing/payments/${paymentId}/`)
        if (data.status === 'completed') {
          if (!cleared.current) {
            clearCart()
            cleared.current = true
          }
          setState('done')
          return
        }
      } catch {
        // transient — keep polling until the cap
      }
      if (polls >= MAX_POLLS) {
        setState('pending')
        return
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS)
    }
    poll()
    return () => clearTimeout(timer)
  }, [paymentId])

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {state === 'polling' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              <h1 className="text-xl font-semibold">Confirming your payment…</h1>
              <p className="text-sm text-muted-foreground">
                This only takes a moment. Please don&apos;t close this page.
              </p>
            </>
          )}
          {state === 'done' && (
            <>
              <CheckCircle2 className="h-10 w-10 text-marketing-accent" />
              <h1 className="text-xl font-semibold">Payment complete!</h1>
              <p className="text-sm text-muted-foreground">Your purchase is now unlocked.</p>
              <Button onClick={() => router.push('/dashboard')}>Go to my content</Button>
            </>
          )}
          {state === 'pending' && (
            <>
              <Clock className="h-10 w-10 text-muted-foreground" />
              <h1 className="text-xl font-semibold">Almost there</h1>
              <p className="text-sm text-muted-foreground">
                Your payment is processing. Your content will unlock automatically — check your
                dashboard in a minute.
              </p>
              <Button variant="outline" onClick={() => router.push('/dashboard')}>
                Go to dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  )
}
