"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { clientFetch } from "@/lib/api-client";

let cached: boolean | null = null; // one status fetch per page session

export function MonetizeNudge({
  price,
}: {
  price: string | number | undefined;
}) {
  const [canMonetize, setCanMonetize] = useState<boolean | null>(cached);

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

  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>
        Students can&apos;t purchase yet —{" "}
        <Link
          href="/admin/payouts"
          className="font-medium underline underline-offset-2"
        >
          set up payouts
        </Link>{" "}
        to start selling.
      </span>
    </div>
  );
}
