"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { clientFetch } from "@/lib/api-client";
import { Play, Loader2, ShoppingCart, Zap, Package } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/types/api";
import { addToCart } from "@/lib/cart";
import type { CourseDetail } from "@/types/course";
import { billingIntervalSuffix } from "@/lib/billing-interval";

interface EnrollButtonProps {
  course: CourseDetail;
}

export function EnrollButton({ course }: EnrollButtonProps) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const opts = course.unlock_options;

  async function handleEnroll() {
    setEnrolling(true);
    try {
      await clientFetch(`/api/v1/courses/${course.slug}/enroll/`, {
        method: "POST",
      });
      router.push(`/learn/${course.slug}`);
    } catch (err) {
      console.error(err);
    } finally {
      setEnrolling(false);
    }
  }

  function handleAddToCart() {
    addToCart({
      content_type: "course",
      object_id: course.id,
      title: course.title,
      price: course.price,
      currency: opts?.purchase?.currency,
      type: "course",
    });
    toast.success("Added to cart", { description: course.title });
  }

  function handleBuyNow() {
    handleAddToCart();
    router.push("/checkout");
  }

  async function handleSubscribe(planId: number) {
    setSubscribing(true);
    try {
      await clientFetch("/api/v1/billing/subscribe/", {
        method: "POST",
        body: JSON.stringify({ plan_id: planId }),
      });
      toast.success("Subscribed! You now have access.");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        router.push(
          "/login?toast=You+need+to+log+in+to+subscribe&toast_type=info",
        );
        return;
      }
      const message =
        err instanceof Error ? err.message : "Subscription failed.";
      toast.error(message);
    } finally {
      setSubscribing(false);
    }
  }

  // Already enrolled
  if (course.is_enrolled) {
    return (
      <Button
        className="w-full gap-2"
        onClick={() => router.push(`/learn/${course.slug}`)}
      >
        <Play className="h-4 w-4" />
        Continue Learning
      </Button>
    );
  }

  // Has access but not enrolled yet
  if (course.access_info?.has_access) {
    return (
      <Button
        className="w-full gap-2"
        onClick={handleEnroll}
        disabled={enrolling}
      >
        {enrolling ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting...
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Start Learning
          </>
        )}
      </Button>
    );
  }

  // Free course
  if (course.pricing_type === "free") {
    return (
      <Button
        className="w-full gap-2"
        onClick={handleEnroll}
        disabled={enrolling}
      >
        {enrolling ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enrolling...
          </>
        ) : (
          "Enroll for Free"
        )}
      </Button>
    );
  }

  // No access — show all unlock options
  const hasPurchase = !!opts?.purchase;
  const hasBundles = !!opts?.bundles?.length;
  const hasPlans = !!opts?.plans?.length;
  const sectionCount = [hasPurchase, hasBundles, hasPlans].filter(
    Boolean,
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Direct purchase */}
      {hasPurchase && (
        <div className="flex flex-col gap-2">
          <Button className="w-full gap-2" onClick={handleBuyNow}>
            <ShoppingCart className="h-4 w-4" />
            Buy Now — {opts.purchase!.price} {opts.purchase!.currency}
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={handleAddToCart}
          >
            Add to Cart
          </Button>
        </div>
      )}

      {/* Bundles */}
      {hasBundles && (
        <>
          {sectionCount > 1 && <Separator className="my-1" />}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Or get it in a bundle
            </p>
            {opts.bundles!.map((bundle) => (
              <Button
                key={bundle.id}
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  addToCart({
                    content_type: "bundle",
                    object_id: bundle.id,
                    title: bundle.name,
                    price: bundle.price,
                    currency: bundle.currency,
                    type: "bundle",
                  });
                  toast.success("Added to cart", { description: bundle.name });
                }}
              >
                <Package className="h-4 w-4" />
                {bundle.name} — {bundle.price} {bundle.currency}
              </Button>
            ))}
          </div>
        </>
      )}

      {/* Subscription plans */}
      {hasPlans && (
        <>
          {sectionCount > 1 && <Separator className="my-1" />}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Or subscribe for access
            </p>
            {opts.plans!.map((plan) => (
              <Button
                key={plan.id}
                variant="outline"
                className="w-full gap-2"
                disabled={subscribing}
                onClick={() => handleSubscribe(plan.id)}
              >
                {subscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {plan.name} — {plan.price} {plan.currency}
                {billingIntervalSuffix(plan.billing_interval_months)}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href="/plans">View all plans</Link>
            </Button>
          </div>
        </>
      )}

      {/* Fallback if no options */}
      {sectionCount === 0 && (
        <Button className="w-full" disabled>
          Coming soon
        </Button>
      )}
    </div>
  );
}
