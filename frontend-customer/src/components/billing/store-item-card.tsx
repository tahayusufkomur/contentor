import { Package, ShoppingCart } from "lucide-react";
import { PriceBadge } from "@/components/billing/price-badge";
import { ListedCover } from "@/components/covers/listed-cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { StoreItem } from "@/types/billing";
import { useLocale, useTranslations } from "next-intl";

const TYPE_LABEL_KEYS = {
  course: "course.label",
  download: "itemType.download",
  live_class: "eventType.liveSession",
  live_stream: "eventType.liveStream",
  onsite_event: "eventType.inPersonEvent",
  bundle: "itemType.bundle",
} as const;

/** A store item's kind in the reader's words; a kind we have no key for shows as stored. */
export function itemTypeLabel(
  type: string,
  t: ReturnType<typeof useTranslations<"site">>,
): string {
  return type in TYPE_LABEL_KEYS
    ? t(TYPE_LABEL_KEYS[type as keyof typeof TYPE_LABEL_KEYS])
    : type.replace("_", " ");
}

interface StoreItemCardProps {
  item: StoreItem;
  adding: boolean;
  onAddToCart: (item: StoreItem) => void;
}

export function StoreItemCard({
  item,
  adding,
  onAddToCart,
}: StoreItemCardProps) {
  const locale = useLocale();
  const t = useTranslations("site");
  const isOwned = item.access_info?.has_access;
  const isBundle = item.type === "bundle";

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 flex flex-col">
      {/* Thumbnail: a kept cover design is drawn live, in place of the photo */}
      {item.cover_design ? (
        <div className="relative h-44 w-full overflow-hidden">
          <ListedCover
            item={item}
            photoClassName="transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : item.thumbnail_url ? (
        <div className="relative overflow-hidden">
          <img
            src={item.thumbnail_url}
            alt={item.title}
            className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex h-44 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
          <span className="text-5xl font-bold text-primary/30">
            {item.title.charAt(0)}
          </span>
        </div>
      )}

      <CardContent className="p-4 space-y-3 flex flex-col flex-1">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {itemTypeLabel(item.type, t)}
          </Badge>
          {isOwned && (
            <Badge variant="success" className="text-xs">
              {t("price.owned")}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold leading-snug line-clamp-2">
          {item.title}
        </h3>

        {/* Bundle extras */}
        {isBundle && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            <span>{t("plan.items", { count: item.item_count })}</span>
            {item.original_price && (
              <span className="line-through ml-1">
                {formatMoney(item.original_price, item.currency, locale)}
              </span>
            )}
          </div>
        )}

        {/* Price badge */}
        <PriceBadge accessInfo={item.access_info} price={item.price} />

        {/* Action */}
        <div className="mt-auto pt-1">
          {isOwned ? null : (
            <Button
              size="sm"
              className="w-full gap-2"
              disabled={adding}
              onClick={() => onAddToCart(item)}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {t("store.addToCart", {
                price: formatMoney(item.price, item.currency, locale),
              })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
