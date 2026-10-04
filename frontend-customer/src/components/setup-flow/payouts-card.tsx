"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Landmark, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  fetchConnectStatus,
  startConnectOnboarding,
  type ConnectStatus,
} from "@/lib/setup-flow";
import { ApiError } from "@/types/api";

const FACTS = [
  {
    icon: CreditCard,
    text: "Students pay by card or wallet at a checkout Stripe runs for you.",
  },
  {
    icon: Landmark,
    text: "Stripe sends the money to your bank account on a regular schedule.",
  },
  {
    icon: ShieldCheck,
    text: "Your bank details stay with Stripe. Contentor never sees them.",
  },
];

/** The payouts step: what payouts are, in plain words, and the Stripe
 * Connect hand-off. Reports readiness up so the action bar can enable. */
export function PayoutsCard({
  onReady,
}: {
  onReady: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Back from Stripe (?connect=return): ask Stripe directly, before the
      // account.updated webhook lands.
      const back =
        new URLSearchParams(window.location.search).get("connect") === "return";
      const s = await fetchConnectStatus(back);
      setStatus(s);
      onReady(s.connected && s.charges_enabled);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setOwnerOnly(true);
      else setError(err);
    } finally {
      setLoading(false);
    }
  }, [onReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const { run: connect, loading: connecting } = useAsyncAction(
    async () => {
      const { onboarding_url } = await startConnectOnboarding();
      window.location.href = onboarding_url;
    },
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 403) setOwnerOnly(true);
        else setError(err);
      },
    },
  );

  const ready = Boolean(status?.connected && status.charges_enabled);

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-5 py-8">
      <div className="w-full max-w-[560px] motion-safe:animate-[sf-rise_.45s_ease-out_both]">
        <h2 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[34px]">
          Get paid by your students
        </h2>
        <p className="mt-3 max-w-[50ch] text-[15px] leading-relaxed text-[var(--sf-graphite)]">
          Payments run through Stripe and go straight to your bank. You’ll
          confirm who you are and where the money should go. It takes about five
          minutes.
        </p>
        <ul className="mt-6 divide-y divide-[var(--sf-line)] rounded-xl border border-[var(--sf-line)] bg-white">
          {FACTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3 px-4 py-3.5 text-sm">
              <Icon
                className="mt-0.5 size-4 shrink-0 text-[var(--sf-brass)]"
                aria-hidden
              />
              {text}
            </li>
          ))}
        </ul>

        <div className="mt-7">
          {ownerOnly ? (
            <p className="rounded-xl bg-[var(--sf-brass-soft)] px-4 py-3.5 text-sm leading-relaxed">
              Only the studio owner can connect payouts. Skip this step for now;
              the owner can connect Stripe later from Payouts.
            </p>
          ) : (
            <PageState
              loading={loading}
              error={error}
              onRetry={load}
              skeleton={<Skeleton className="h-11 w-56 rounded-full" />}
            >
              {ready ? (
                <p className="flex items-center gap-2.5 text-[15px] font-medium">
                  <span className="flex size-6 items-center justify-center rounded-full bg-[var(--sf-ink)] text-white">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  Payouts are connected
                </p>
              ) : (
                <div className="space-y-3">
                  {status?.connected && (
                    <p className="text-sm text-[var(--sf-graphite)]">
                      Stripe still needs a few details before you can take
                      payments.
                    </p>
                  )}
                  <Button
                    size="lg"
                    onClick={() => connect()}
                    loading={connecting}
                    loadingText="Opening Stripe…"
                    className="rounded-full px-7"
                  >
                    {status?.connected
                      ? "Continue on Stripe"
                      : "Connect with Stripe"}
                  </Button>
                </div>
              )}
            </PageState>
          )}
        </div>
      </div>
    </div>
  );
}
