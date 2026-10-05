"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { startCheckout } from "@/lib/api/billing-platform";
import { formatPrice } from "@/lib/interview";
import {
  BLOCKERS,
  type GoLiveState,
  type SetupFlowApi,
} from "@/lib/setup-flow";
import { ApiError } from "@/types/api";
import { PayoutsCard } from "./payouts-card";

/** The last stretch: a paid plan and Stripe only when the coach sells, a
 * "make it free" way out of both, then publish. */
export function GoLiveCard({
  api,
  onPublished,
}: {
  api: SetupFlowApi;
  onPublished: () => void;
}) {
  const [state, setState] = useState<GoLiveState | null>(null);
  const [payoutsReady, setPayoutsReady] = useState(false);
  const [returning] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success",
  );

  const load = useCallback(async () => {
    try {
      setState(await api.golive());
    } catch {
      // A missed poll is harmless; the next one catches up.
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  // Pages still composing, or a just-paid plan waiting on Stripe's webhook.
  const waiting =
    !!state && (state.building || (returning && state.needs_plan));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [waiting, load]);
  useEffect(() => {
    if (payoutsReady) void load();
  }, [payoutsReady, load]);

  const { run: checkout, loading: checkingOut } = useAsyncAction(
    async () => {
      if (!state?.plan) return;
      const { checkout_url } = await startCheckout(state.plan.id, "/setup");
      window.location.href = checkout_url;
    },
    { errorToast: "Couldn’t open checkout. Try again." },
  );
  const { run: makeFree, loading: freeing } = useAsyncAction(
    async () => setState(await api.goliveAction("make_free")),
    { errorToast: "Couldn’t switch to free. Try again." },
  );
  const { run: publish, loading: publishing } = useAsyncAction(
    async () => {
      try {
        await api.goliveAction("publish");
        onPublished();
      } catch (err) {
        const blockers =
          err instanceof ApiError ? err.data.blockers : undefined;
        if (Array.isArray(blockers)) {
          setState((prev) =>
            prev ? { ...prev, blockers: blockers as string[] } : prev,
          );
          toast.error("A few things need finishing before you go live.");
          return;
        }
        throw err;
      }
    },
    { errorToast: "Couldn’t publish your site. Try again." },
  );

  const shell = (children: React.ReactNode) => (
    <div className="rounded-2xl border border-[var(--sf-line)] bg-white p-4 motion-safe:animate-fade-in-up">
      {children}
    </div>
  );

  if (!state || state.building || (returning && state.needs_plan)) {
    return shell(
      <p className="flex items-center gap-2 text-[14px] text-[var(--sf-graphite)]">
        <Spinner size="sm" className="text-[var(--sf-brass)]" />
        {returning && state?.needs_plan
          ? "Confirming your plan…"
          : "Finishing your pages…"}
      </p>,
    );
  }

  const free = (
    <Button
      variant="ghost"
      onClick={() => makeFree()}
      loading={freeing}
      className="rounded-full"
    >
      Make it free and go live now
    </Button>
  );

  if (state.needs_plan && state.plan) {
    const price = formatPrice(state.plan.amount_cents, state.plan.currency);
    return shell(
      <>
        <p className="text-[15px] font-semibold">
          To sell on your site, choose {state.plan.name}
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
          Paid courses and live classes need the {state.plan.name} plan
          {price ? ` (${price} a month)` : ""}. You’ll come straight back here.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => checkout()}
            loading={checkingOut}
            className="rounded-full px-6"
          >
            Choose {state.plan.name}
          </Button>
          {free}
        </div>
      </>,
    );
  }

  if (state.needs_payouts) {
    return shell(
      <>
        <div className="h-[340px]">
          <PayoutsCard onReady={setPayoutsReady} />
        </div>
        <div className="mt-2">{free}</div>
      </>,
    );
  }

  return shell(
    <>
      <p className="text-[15px] font-semibold">Ready when you are</p>
      {state.blockers.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-[var(--sf-graphite)]">
          {state.blockers.map((b) => (
            <li key={b}>{BLOCKERS[b]?.label ?? b}</li>
          ))}
        </ul>
      )}
      <Button
        size="lg"
        onClick={() => publish()}
        loading={publishing}
        loadingText="Going live…"
        className="mt-4 rounded-full px-7"
      >
        Go live
      </Button>
    </>,
  );
}
