"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Landmark, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { SpecialistFace } from "@/components/copilot/specialist-face";
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
  { icon: CreditCard, key: "pay" },
  { icon: Landmark, key: "bank" },
  { icon: ShieldCheck, key: "private" },
];

/** The payouts step: what payouts are, in plain words, and the Stripe
 * Connect hand-off. Reports readiness up so the action bar can enable. */
export function PayoutsCard({
  onReady,
}: {
  onReady: (ready: boolean) => void;
}) {
  const t = useTranslations("admin");
  const s = useTranslations("admin.setupFlow");
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
    <div className="flex h-full overflow-y-auto px-5 py-8">
      {/* m-auto centres it when it fits and still scrolls from the top when not. */}
      <div className="m-auto w-full max-w-[560px] motion-safe:animate-[sf-rise_.45s_ease-out_both]">
        <div className="mb-4 flex items-center gap-2.5">
          <SpecialistFace k="finance" size="md" />
          <div className="leading-tight">
            <p className="text-sm font-medium">
              {t("team.specialists.finance.name")}
            </p>
            <p className="text-[13.5px] text-[var(--sf-graphite)]">
              {s("payouts.lead")}
            </p>
          </div>
        </div>
        <h2 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[34px]">
          {s("payouts.title")}
        </h2>
        <p className="mt-3 max-w-[50ch] text-[15px] leading-relaxed text-[var(--sf-graphite)]">
          {s("payouts.body")}
        </p>
        <ul className="mt-6 divide-y divide-[var(--sf-line)] rounded-xl border border-[var(--sf-line)] bg-white">
          {FACTS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex gap-3 px-4 py-3.5 text-sm">
              <Icon
                className="mt-0.5 size-4 shrink-0 text-[var(--sf-brass)]"
                aria-hidden
              />
              {s(`payouts.fact.${key}` as never)}
            </li>
          ))}
        </ul>

        <div className="mt-7">
          {ownerOnly ? (
            <p className="rounded-xl bg-[var(--sf-brass-soft)] px-4 py-3.5 text-sm leading-relaxed">
              {s("payouts.ownerOnly")}
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
                  {s("payouts.connected")}
                </p>
              ) : (
                <div className="space-y-3">
                  {status?.connected && (
                    <p className="text-sm text-[var(--sf-graphite)]">
                      {s("payouts.needsDetails")}
                    </p>
                  )}
                  <Button
                    size="lg"
                    onClick={() => connect()}
                    loading={connecting}
                    loadingText={s("payouts.opening")}
                    className="rounded-full px-7"
                  >
                    {status?.connected
                      ? s("payouts.continue")
                      : s("payouts.connect")}
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
