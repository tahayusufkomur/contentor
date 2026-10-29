"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { PageState } from "@/components/ui/page-state";
import { SkeletonList } from "@/components/ui/skeletons";
import { clientFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useLocale, useTranslations } from "next-intl";
import { dyn } from "@/i18n/dynamic";

export const dynamic = "force-dynamic";

interface PaymentItem {
  id: number;
  title: string;
  item_price: string;
  is_refunded: boolean;
}

interface Payment {
  id: number;
  payment_type: string;
  status: string;
  amount: string;
  currency: string;
  created_at: string | null;
  items: PaymentItem[];
}

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "secondary" | "destructive"
> = {
  completed: "success",
  partially_refunded: "warning",
  refunded: "secondary",
  pending: "secondary",
  failed: "destructive",
};

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

export default function StudentPaymentsPage() {
  const locale = useLocale();
  const t = useTranslations("admin.students.payments");
  const tPay = useTranslations("admin.store.payments");
  const params = useParams();
  const studentId = params.id as string;
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [confirmItem, setConfirmItem] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayments(
        await clientFetch<Payment[]>(
          `/api/v1/billing/students/${studentId}/payments/`,
        ),
      );
    } catch (err) {
      setError(err);
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [studentId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const purchases = payments.filter((p) => p.payment_type !== "refund");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/students">
            <ArrowLeft className="h-4 w-4" /> {t("back")}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      </div>

      <PageState
        loading={loading}
        error={error}
        onRetry={load}
        skeleton={<SkeletonList count={4} />}
      >
        {purchases.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title={t("empty")}
            description={t("emptyHint")}
          />
        ) : (
          <div className="space-y-4">
            {purchases.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base capitalize">
                      {t(dyn(t, `type.${p.payment_type}`))} ·{" "}
                      {formatMoney(p.amount, p.currency, locale)}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"}>
                        {tPay(dyn(tPay, `statuses.${p.status}`))}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(p.created_at, locale)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {p.items.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("noLineItems")}
                    </p>
                  )}
                  {p.items.map((item) => (
                    <div key={item.id}>
                      <Separator className="mb-2" />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{item.title}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {formatMoney(item.item_price, p.currency, locale)}
                          </span>
                          {item.is_refunded ? (
                            <Badge variant="secondary">{t("refunded")}</Badge>
                          ) : p.status === "pending" ? null : confirmItem ===
                            item.id ? (
                            <RefundConfirmActions
                              paymentId={p.id}
                              itemId={item.id}
                              onCancel={() => setConfirmItem(null)}
                              onRefunded={async () => {
                                setConfirmItem(null);
                                await load();
                              }}
                            />
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmItem(item.id)}
                            >
                              {t("refund")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageState>
    </div>
  );
}

function RefundConfirmActions({
  paymentId,
  itemId,
  onCancel,
  onRefunded,
}: {
  paymentId: number;
  itemId: number;
  onCancel: () => void;
  onRefunded: () => Promise<void> | void;
}) {
  const t = useTranslations("admin.students.payments");
  const { run: confirmRefund, loading: refunding } = useAsyncAction(
    async () => {
      await clientFetch(
        `/api/v1/billing/payments/${paymentId}/items/${itemId}/refund/`,
        { method: "POST" },
      );
      toast.success(t("itemRefunded"));
      await onRefunded();
    },
    { errorToast: t("refundError") },
  );

  return (
    <span className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={refunding}>
        {t("cancel")}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        loading={refunding}
        loadingText={t("refunding")}
        onClick={confirmRefund}
      >
        {t("confirmRefund")}
      </Button>
    </span>
  );
}
