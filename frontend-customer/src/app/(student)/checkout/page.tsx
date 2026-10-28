"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import { getCart, removeFromCart, clearCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import type { CartItem } from "@/types/billing";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  EmbeddedCheckoutOverlay,
  type CheckoutStart,
} from "@shared/checkout/embedded-checkout";
import { StudentCheckoutAside } from "@/components/billing/checkout-panels";
import { itemTypeLabel } from "@/components/billing/store-item-card";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { useLocale, useTranslations } from "next-intl";

interface PaymentInitializeResponse extends CheckoutStart {
  payment_id: number;
  status: string;
}

export default function CheckoutPage() {
  const locale = useLocale();
  const t = useTranslations("student.checkout");
  const tSite = useTranslations("site");
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [session, setSession] = useState<
    (CheckoutStart & { client_secret: string }) | null
  >(null);

  useEffect(() => {
    setCart(getCart());
    if (searchParams.get("canceled")) {
      toast.info(t("canceled"));
    }
  }, [searchParams, t]);

  const handleRemove = (item: CartItem) => {
    removeFromCart(item.content_type, item.object_id);
    setCart(getCart());
    toast.info(t("removed", { title: item.title }));
  };

  const total = cart.reduce(
    (sum, item) => sum + parseFloat(item.price || "0"),
    0,
  );
  // All items on a tenant are priced in the tenant's single charge currency.
  const cartCurrency = cart.find((item) => item.currency)?.currency ?? "USD";
  const itemPrice = (item: CartItem) =>
    formatMoney(item.price, item.currency || cartCurrency, locale);
  // toFixed(2) drops float noise, so a whole total still reads "$20".
  const totalLabel = formatMoney(total.toFixed(2), cartCurrency, locale);

  const { run: handlePay, loading: paying } = useAsyncAction(
    async () => {
      if (cart.length === 0) return;
      const res = await clientFetch<PaymentInitializeResponse>(
        "/api/v1/billing/payments/initialize/",
        {
          method: "POST",
          body: JSON.stringify({
            items: cart.map((item) => ({
              content_type: item.content_type,
              object_id: item.object_id,
            })),
          }),
        },
      );
      // Real Stripe checkout: embedded here, or Stripe's hosted page. Keep the
      // cart so closing (or a cancel) leaves it intact; the success page clears it.
      if (res.client_secret) {
        setSession({ ...res, client_secret: res.client_secret });
        return;
      }
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }
      // Bypass (dev/CI): payment already completed server-side.
      clearCart();
      toast.success(t("paid"));
      navigate("/dashboard");
    },
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 403) {
          navigate(
            `/login?toast=${encodeURIComponent(t("loginToPurchase"))}&toast_type=info`,
          );
          return;
        }
        toast.error(err instanceof Error ? err.message : t("payFailed"));
      },
    },
  );

  if (cart.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {tSite("checkout.title")}
          </h1>
        </div>
        <EmptyState
          icon={ShoppingCart}
          title={t("emptyTitle")}
          description={t("emptyText")}
          action={{ label: t("goToStore"), href: "/store" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {session && (
        <EmbeddedCheckoutOverlay
          session={session}
          onClose={() => setSession(null)}
          aside={
            <StudentCheckoutAside
              title={
                cart.length === 1
                  ? cart[0].title
                  : tSite("checkout.andMore", {
                      title: cart[0].title,
                      count: cart.length - 1,
                    })
              }
              photo={cart.find((item) => item.image)?.image}
              steps={[
                {
                  when: tSite("checkout.now"),
                  what: tSite("checkout.paySecurely", { amount: totalLabel }),
                },
                {
                  when: tSite("checkout.rightAfter"),
                  what: tSite("checkout.opensInDashboard"),
                },
              ]}
            />
          }
        />
      )}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {tSite("checkout.title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("review")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-3">
          {cart.map((item) => (
            <Card key={`${item.content_type}-${item.object_id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{item.title}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {itemTypeLabel(item.type, tSite)}
                  </p>
                </div>
                <div className="text-right flex items-center gap-3 shrink-0">
                  <span className="font-semibold tabular-nums">
                    {itemPrice(item)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(item)}
                    aria-label={t("remove", { title: item.title })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Order summary */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>{t("orderSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.map((item) => (
                <div
                  key={`summary-${item.content_type}-${item.object_id}`}
                  className="flex justify-between text-sm"
                >
                  <span className="text-muted-foreground truncate max-w-[160px]">
                    {item.title}
                  </span>
                  <span className="tabular-nums shrink-0 ml-2">
                    {itemPrice(item)}
                  </span>
                </div>
              ))}

              <Separator />

              <div className="flex justify-between font-semibold text-base">
                <span>{t("total")}</span>
                <span className="tabular-nums">{totalLabel}</span>
              </div>

              <Button
                className="w-full gap-2"
                size="lg"
                loading={paying}
                loadingText={t("processing")}
                onClick={handlePay}
              >
                {t("pay", { total: totalLabel })}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
