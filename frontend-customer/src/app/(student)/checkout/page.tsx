"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import { getCart, removeFromCart, clearCart } from "@/lib/cart";
import type { CartItem } from "@/types/billing";

interface PaymentInitializeResponse {
  payment_id: number;
  status: string;
  checkout_url?: string;
  [key: string]: unknown;
}

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setCart(getCart());
    if (searchParams.get("canceled")) {
      toast.info("Checkout canceled — your cart is still here.");
    }
  }, [searchParams]);

  const handleRemove = (item: CartItem) => {
    removeFromCart(item.content_type, item.object_id);
    setCart(getCart());
    toast.info(`"${item.title}" removed from cart`);
  };

  const total = cart.reduce(
    (sum, item) => sum + parseFloat(item.price || "0"),
    0,
  );
  const totalFormatted = total.toFixed(2);
  // All items on a tenant are priced in the tenant's single charge currency.
  const cartCurrency = cart.find((item) => item.currency)?.currency ?? "";

  const handlePay = async () => {
    if (cart.length === 0) return;
    setPaying(true);
    try {
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
      // Real Stripe checkout: hand off to the hosted page. Keep the cart so a
      // cancel returns the buyer here intact; the success page clears it.
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }
      // Bypass (dev/CI): payment already completed server-side.
      clearCart();
      toast.success("Payment successful! Redirecting to dashboard...");
      router.push("/dashboard");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        router.push(
          "/login?toast=You+need+to+log+in+to+purchase&toast_type=info",
        );
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : "Payment failed. Please try again.";
      toast.error(message);
    } finally {
      setPaying(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Checkout
          </h1>
        </div>
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Add some items from the store before checking out."
          action={{ label: "Go to Store", href: "/store" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Checkout
        </h1>
        <p className="mt-1 text-muted-foreground">
          Review your items before payment.
        </p>
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
                    {item.type.replace("_", " ")}
                  </p>
                </div>
                <div className="text-right flex items-center gap-3 shrink-0">
                  <span className="font-semibold tabular-nums">
                    {item.price} {item.currency ?? ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(item)}
                    aria-label={`Remove ${item.title}`}
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
              <CardTitle>Order Summary</CardTitle>
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
                    {item.price} {item.currency ?? ""}
                  </span>
                </div>
              ))}

              <Separator />

              <div className="flex justify-between font-semibold text-base">
                <span>Total</span>
                <span className="tabular-nums">
                  {totalFormatted} {cartCurrency}
                </span>
              </div>

              <Button
                className="w-full gap-2"
                size="lg"
                disabled={paying}
                onClick={handlePay}
              >
                {paying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Pay {totalFormatted} {cartCurrency}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
