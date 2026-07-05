"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { clientFetch } from "@/lib/api-client";

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

function formatDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function StudentPaymentsPage() {
  const params = useParams();
  const studentId = params.id as string;
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmItem, setConfirmItem] = useState<number | null>(null);
  const [busyItem, setBusyItem] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setPayments(
        await clientFetch<Payment[]>(
          `/api/v1/billing/students/${studentId}/payments/`,
        ),
      );
    } catch {
      toast.error("Could not load payment history.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function refund(paymentId: number, itemId: number) {
    setBusyItem(itemId);
    try {
      await clientFetch(
        `/api/v1/billing/payments/${paymentId}/items/${itemId}/refund/`,
        { method: "POST" },
      );
      toast.success("Item refunded.");
      setConfirmItem(null);
      await load();
    } catch {
      toast.error("Refund failed. Please try again.");
    } finally {
      setBusyItem(null);
    }
  }

  const purchases = payments.filter((p) => p.payment_type !== "refund");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/students">
            <ArrowLeft className="h-4 w-4" /> Students
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Payment history</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : purchases.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="No payments"
          description="This student hasn't purchased anything yet."
        />
      ) : (
        <div className="space-y-4">
          {purchases.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base capitalize">
                    {p.payment_type.replace("_", " ")} · {p.amount} {p.currency}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"}>
                      {p.status.replace("_", " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(p.created_at)}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Subscription charge (no line items).
                  </p>
                )}
                {p.items.map((item) => (
                  <div key={item.id}>
                    <Separator className="mb-2" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{item.title}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {item.item_price} {p.currency}
                        </span>
                        {item.is_refunded ? (
                          <Badge variant="secondary">Refunded</Badge>
                        ) : p.status === "pending" ? null : confirmItem ===
                          item.id ? (
                          <span className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmItem(null)}
                              disabled={busyItem === item.id}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => refund(p.id, item.id)}
                              disabled={busyItem === item.id}
                            >
                              {busyItem === item.id
                                ? "Refunding…"
                                : "Confirm refund"}
                            </Button>
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmItem(item.id)}
                          >
                            Refund
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
    </div>
  );
}
