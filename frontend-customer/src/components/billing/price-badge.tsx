import { Badge } from "@/components/ui/badge";
import { stateLine } from "@/lib/access/terms";
import { formatMoney } from "@/lib/format";
import type { AccessInfo } from "@/types/billing";
import { useLocale } from "next-intl";

interface PriceBadgeProps {
  accessInfo?: AccessInfo;
  price?: string;
  pricingType?: string;
}

export function PriceBadge(props: PriceBadgeProps) {
  const locale = useLocale();
  const badge = <PricePill {...props} />;
  const state = props.accessInfo ? stateLine(props.accessInfo, locale) : "";
  if (!state) return badge;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {badge}
      <span className="text-xs text-muted-foreground">{state}</span>
    </span>
  );
}

function PricePill({ accessInfo, price, pricingType }: PriceBadgeProps) {
  const locale = useLocale();
  if (accessInfo?.has_access && accessInfo.access_reason !== "free") {
    return <Badge variant="success">Owned</Badge>;
  }

  const effectivePricingType = accessInfo?.pricing_type ?? pricingType;

  if (effectivePricingType === "free") {
    return <Badge variant="success">Free</Badge>;
  }

  if (effectivePricingType === "subscription") {
    return <Badge variant="secondary">Included in subscription</Badge>;
  }

  const effectivePrice = accessInfo?.price ?? price;
  if (effectivePricingType === "paid" && effectivePrice) {
    return (
      <Badge variant="default">
        {formatMoney(effectivePrice, accessInfo?.currency || "USD", locale)}
      </Badge>
    );
  }

  return <Badge variant="default">Paid</Badge>;
}
