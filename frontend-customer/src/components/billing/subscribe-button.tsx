'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { clientFetch } from '@/lib/api-client'
import { ApiError } from '@/types/api'
import { Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'

interface SubscribeButtonProps {
  planId: number
  planName: string
  price: string
  currency: string
  className?: string
  variant?: 'default' | 'outline'
  size?: 'default' | 'sm' | 'lg'
}

export function SubscribeButton({
  planId,
  planName,
  price,
  currency,
  className,
  variant = 'default',
  size = 'default',
}: SubscribeButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSubscribe() {
    setLoading(true)
    try {
      const res = await clientFetch<{ checkout_url?: string }>('/api/v1/billing/subscribe/', {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId }),
      })
      // Real Stripe checkout (mode=subscription): redirect to the hosted page.
      if (res?.checkout_url) {
        window.location.href = res.checkout_url
        return
      }
      // Bypass: subscription is active immediately.
      toast.success(`Subscribed to ${planName}!`)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.push('/login?toast=You+need+to+log+in+to+subscribe&toast_type=info')
        return
      }
      if (err instanceof ApiError && err.status === 400) {
        toast.info("You're already subscribed to this plan")
        return
      }
      const message = err instanceof Error ? err.message : 'Subscription failed.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      className={className}
      variant={variant}
      size={size}
      disabled={loading}
      onClick={handleSubscribe}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Zap className="mr-2 h-4 w-4" />
      )}
      Subscribe — {price} {currency}/mo
    </Button>
  )
}
