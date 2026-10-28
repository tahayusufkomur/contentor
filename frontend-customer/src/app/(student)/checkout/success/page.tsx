"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { clientFetch } from "@/lib/api-client";
import { clearCart } from "@/lib/cart";
import { useNavigate } from "@shared/navigation/navigation-provider";

interface PaymentStatus {
  payment_id: number;
  status: string;
}

// Mirror the M1 platform-checkout pattern: poll ~30s for the webhook to mark
// the payment completed, then clear the cart and send the buyer to their content.
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;

function SuccessInner() {
  const t = useTranslations("student.checkoutSuccess");
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("payment_id");
  const [state, setState] = useState<"polling" | "done" | "pending">("polling");
  const cleared = useRef(false);

  useEffect(() => {
    if (!paymentId) {
      setState("pending");
      return;
    }
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      polls += 1;
      try {
        const data = await clientFetch<PaymentStatus>(
          `/api/v1/billing/payments/${paymentId}/`,
        );
        if (data.status === "completed") {
          if (!cleared.current) {
            clearCart();
            cleared.current = true;
          }
          setState("done");
          return;
        }
      } catch {
        // transient — keep polling until the cap
      }
      if (polls >= MAX_POLLS) {
        setState("pending");
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
    return () => clearTimeout(timer);
  }, [paymentId]);

  return (
    <div className="mx-auto max-w-md py-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {state === "polling" && (
            <>
              <Spinner size="lg" label={t("confirmingLabel")} />
              <h1 className="text-xl font-semibold">{t("confirming")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("confirmingText")}
              </p>
            </>
          )}
          {state === "done" && (
            <>
              <CheckCircle2 className="h-10 w-10 text-marketing-accent" />
              <h1 className="text-xl font-semibold">{t("done")}</h1>
              <p className="text-sm text-muted-foreground">{t("doneText")}</p>
              <Button onClick={() => navigate("/dashboard")}>
                {t("goToContent")}
              </Button>
            </>
          )}
          {state === "pending" && (
            <>
              <Clock className="h-10 w-10 text-muted-foreground" />
              <h1 className="text-xl font-semibold">{t("pending")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("pendingText")}
              </p>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                {t("goToDashboard")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
