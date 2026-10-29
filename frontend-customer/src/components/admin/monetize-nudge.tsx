"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { clientFetch } from "@/lib/api-client";
import {
  useEntitlements,
  useIsLocked,
} from "@/components/admin/entitlements-provider";

let cached: boolean | null = null; // one status fetch per page session

export function MonetizeNudge({
  price,
}: {
  price: string | number | undefined;
}) {
  const t = useTranslations("admin.monetize");
  const [canMonetize, setCanMonetize] = useState<boolean | null>(cached);
  const onFreePlan = useIsLocked("selling");
  const trialing = useEntitlements().entitlements?.trialing;

  useEffect(() => {
    if (cached !== null) return;
    clientFetch<{ can_monetize: boolean }>("/api/v1/billing/connect/status/")
      .then((s) => {
        cached = s.can_monetize;
        setCanMonetize(s.can_monetize);
      })
      .catch(() => {});
  }, []);

  if (canMonetize !== false) return null;
  if (!price || Number(price) <= 0) return null;

  if (onFreePlan) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>
          {t.rich(trialing ? "trialing" : "freePlan", {
            link: (chunks) => (
              <Link
                href="/admin/billing"
                className="font-medium underline underline-offset-2"
              >
                {chunks}
              </Link>
            ),
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>
        {t.rich("noPayouts", {
          link: (chunks) => (
            <Link
              href="/admin/payouts"
              className="font-medium underline underline-offset-2"
            >
              {chunks}
            </Link>
          ),
        })}
      </span>
    </div>
  );
}
