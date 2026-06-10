import { Badge } from '@/components/ui/badge'
import type { AccessInfo } from '@/types/billing'

interface PriceBadgeProps {
  accessInfo?: AccessInfo
  price?: string
  pricingType?: string
}

export function PriceBadge({ accessInfo, price, pricingType }: PriceBadgeProps) {
  if (accessInfo?.has_access && accessInfo.access_reason !== 'free') {
    return <Badge variant="success">Owned</Badge>
  }

  const effectivePricingType = accessInfo?.pricing_type ?? pricingType

  if (effectivePricingType === 'free') {
    return <Badge variant="success">Free</Badge>
  }

  const effectivePrice = accessInfo?.price ?? price
  if (effectivePricingType === 'paid' && effectivePrice) {
    return (
      <Badge variant="default">
        {effectivePrice} {accessInfo?.currency ?? ''}
      </Badge>
    )
  }

  return <Badge variant="default">Paid</Badge>
}
