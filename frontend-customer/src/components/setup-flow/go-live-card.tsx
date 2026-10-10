"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { startCheckout } from "@/lib/api/billing-platform";
import { formatPrice } from "@/lib/interview";
import {
  BLOCKERS,
  type GoLiveState,
  type GoLiveStep,
  type SetupFlowApi,
} from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types/api";
import { PayoutsCard } from "./payouts-card";

/** The last stretch: a paid plan and Stripe only when the coach sells, two
 * ways out of both ("go live now, sell later" keeps her prices, "make it
 * free" drops them), then publish. */
export function GoLiveCard({
  api,
  onPublished,
}: {
  api: SetupFlowApi;
  onPublished: () => void;
}) {
  const [state, setState] = useState<GoLiveState | null>(null);
  const [payoutsReady, setPayoutsReady] = useState(false);
  // "Make it free" first says what it will change, then asks.
  const [confirmFree, setConfirmFree] = useState(false);
  const [returning, setReturning] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success",
  );
  // The flag lives in state only: a reload must not wait on Stripe again.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("checkout")) return;
    url.searchParams.delete("checkout");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  // Stripe's webhook is usually seconds; past a minute stop waiting and show
  // the plan card again (with the free way out) instead of spinning forever.
  useEffect(() => {
    if (!returning) return;
    const t = setTimeout(() => {
      setReturning(false);
      toast.message(
        "Your payment is still being confirmed. If it went through, reload this page in a minute.",
      );
    }, 60_000);
    return () => clearTimeout(t);
  }, [returning]);

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
  const { run: sellLater, loading: holding } = useAsyncAction(
    async () => setState(await api.goliveAction("sell_later")),
    { errorToast: "Couldn’t hold your paid items back. Try again." },
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
      {state && state.steps?.length > 1 && <Steps steps={state.steps} />}
      {children}
      {state && state.summary?.length > 0 && (
        <dl className="mt-5 space-y-1.5 border-t border-[var(--sf-line)] pt-4 text-[13.5px] leading-snug">
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--sf-faint)]">
            What I built
          </p>
          {state.summary.map((line) => (
            <div key={line.label} className="flex gap-3">
              <dt className="w-28 shrink-0 text-[var(--sf-graphite)]">
                {line.label}
              </dt>
              <dd className="min-w-0">{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
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

  const free =
    confirmFree && state.free_effects.length > 0 ? (
      <div
        role="group"
        aria-label="Make it free"
        className="mt-1 w-full rounded-xl border border-[var(--sf-line)] bg-[var(--sf-tint)] p-3 text-[13.5px] leading-relaxed"
      >
        <p className="font-medium">Going free changes this:</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[var(--sf-graphite)]">
          {state.free_effects.map((effect) => (
            <li key={effect}>{effect}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => makeFree()}
            loading={freeing}
            loadingText="Making it free…"
            className="rounded-full px-4"
          >
            Yes, make it free
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmFree(false)}
            className="rounded-full"
          >
            Keep my prices
          </Button>
        </div>
      </div>
    ) : (
      <Button
        variant="ghost"
        onClick={() =>
          state.free_effects.length ? setConfirmFree(true) : makeFree()
        }
        loading={freeing}
        className="rounded-full"
      >
        Make it free and go live now
      </Button>
    );

  const later = (
    <Button
      variant="outline"
      onClick={() => sellLater()}
      loading={holding}
      loadingText="Holding them back…"
      className="rounded-full"
    >
      Go live now, sell later
    </Button>
  );
  const laterHint = (
    <p className="mt-3 text-[13px] leading-relaxed text-[var(--sf-faint)]">
      Going live now keeps your prices: paid items wait as drafts and go on sale
      on their own once you can take payments.
    </p>
  );

  if (state.needs_plan && state.plan) {
    const price = formatPrice(state.plan.amount_cents, state.plan.currency);
    // Plan names are stored lowercase ("starter"); shown capitalised.
    const name =
      state.plan.name.charAt(0).toUpperCase() + state.plan.name.slice(1);
    return shell(
      <>
        <p className="text-[15px] font-semibold">
          To sell on your site, choose {name}
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
          Paid courses and live classes need the {name} plan
          {price ? ` (${price} a month)` : ""}. You’ll come straight back here.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => checkout()}
            loading={checkingOut}
            className="rounded-full px-6"
          >
            Choose {name}
          </Button>
          {later}
          {free}
        </div>
        {!confirmFree && laterHint}
      </>,
    );
  }

  if (state.needs_payouts) {
    return shell(
      <>
        <div className="h-[340px]">
          <PayoutsCard onReady={setPayoutsReady} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {later}
          {free}
        </div>
        {!confirmFree && laterHint}
      </>,
    );
  }

  return shell(
    <>
      <p className="text-[15px] font-semibold">Ready when you are</p>
      {state.held?.length > 0 && (
        <div className="mt-2 rounded-xl bg-[var(--sf-tint)] p-3 text-[13.5px] leading-relaxed">
          <p className="font-medium">
            Waiting, with your prices, until you sell:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[var(--sf-graphite)]">
            {state.held.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[var(--sf-graphite)]">
            Choose a plan and set up payouts from your dashboard any time; they
            go on sale on their own.
          </p>
        </div>
      )}
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

/** Every step left before going live, the current one first in weight. */
function Steps({ steps }: { steps: GoLiveStep[] }) {
  const current = steps.find((s) => !s.done)?.id;
  return (
    <ol className="mb-4 space-y-2 border-b border-[var(--sf-line)] pb-4">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2.5 text-[14px]">
          <span
            aria-hidden
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              s.done
                ? "bg-[var(--sf-ink)] text-[var(--sf-paper)]"
                : s.id === current
                  ? "border border-[var(--sf-ink)]"
                  : "border border-[var(--sf-line-strong)] text-[var(--sf-faint)]",
            )}
          >
            {s.done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
          </span>
          <span
            className={cn(
              s.done && "text-[var(--sf-faint)]",
              s.id === current && "font-semibold",
            )}
          >
            {s.label}
            {s.done && <span className="sr-only"> (done)</span>}
          </span>
          {!s.done && (
            <span className="ml-auto shrink-0 text-[12.5px] text-[var(--sf-faint)]">
              about {s.minutes} min
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
