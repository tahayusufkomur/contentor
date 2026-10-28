"use client";

import { useEffect, useState } from "react";
import { Receipt, ExternalLink, ShoppingBag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageState } from "@/components/ui/page-state";
import { SkeletonList } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/shared/empty-state";
import { clientFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useLocale, useTranslations } from "next-intl";

interface OrderItem {
  id: number;
  title: string;
  item_price: string;
  is_refunded: boolean;
}

interface Order {
  id: number;
  payment_type: string;
  status: string;
  amount: string;
  currency: string;
  created_at: string | null;
  receipt_url: string;
  items: OrderItem[];
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  completed: "success",
  partially_refunded: "warning",
  refunded: "secondary",
  pending: "secondary",
};

/** A stored enum value as the reader's words; a value we have no key for shows as stored. */
function enumLabel(
  t: ReturnType<typeof useTranslations<"student.orders">>,
  group: "paymentType" | "status",
  value: string,
) {
  const key = `${group}.${value}` as "status.completed";
  return t.has(key) ? t(key) : value.replace("_", " ");
}

function formatDate(iso: string | null, locale: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function OrdersPage() {
  const locale = useLocale();
  const t = useTranslations("student.orders");
  const tSite = useTranslations("site");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    clientFetch<Order[]>("/api/v1/billing/orders/")
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <SkeletonList count={3} />
        </div>
      }
      className="space-y-6"
    >
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("text")}</p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={t("emptyTitle")}
          description={t("emptyText")}
          action={{ label: tSite("store.browse"), href: "/store" }}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Card key={o.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base capitalize">
                    {enumLabel(t, "paymentType", o.payment_type)} ·{" "}
                    {formatMoney(o.amount, o.currency, locale)}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[o.status] ?? "secondary"}>
                      {enumLabel(t, "status", o.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(o.created_at, locale)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {o.items.map((item) => (
                  <p
                    key={item.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span
                      className={
                        item.is_refunded
                          ? "text-muted-foreground line-through"
                          : ""
                      }
                    >
                      {item.title}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(item.item_price, o.currency, locale)}
                    </span>
                  </p>
                ))}
                {o.receipt_url && (
                  <>
                    <Separator />
                    <Button asChild variant="ghost" size="sm" className="gap-2">
                      <a
                        href={o.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Receipt className="h-4 w-4" /> {t("receipt")}
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
    </PageState>
  );
}
