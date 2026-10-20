"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { SpecialistFace } from "@/components/copilot/specialist-face";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  EmbeddedCheckoutOverlay,
  type CheckoutStart,
} from "@shared/checkout/embedded-checkout";
import { CoachPlanAside } from "@/components/billing/checkout-panels";
import {
  getSubscription,
  startCheckout,
  updateSubscription,
} from "@/lib/api/billing-platform";
import { formatPrice } from "@/lib/interview";
import {
  BLOCKERS,
  type GoLiveState,
  type GoLiveStep,
  type SetupFlowApi,
  type TeamLine,
} from "@/lib/setup-flow";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types/api";
import { PayoutsCard } from "./payouts-card";

/** The last stretch: a paid plan and Stripe only when the coach sells, one
 * way out of both ("go live now, sell later" keeps her prices), then
 * publish. There is no going free: only paid plans exist. A coach with no
 * plan starts the Starter trial first; the trial cannot sell, so a site that
 * sells starts its plan now or sells later. */
export function GoLiveCard({
  api,
  onPublished,
}: {
  api: SetupFlowApi;
  onPublished: (team: TeamLine[]) => void;
}) {
  const [state, setState] = useState<GoLiveState | null>(null);
  const [payoutsReady, setPayoutsReady] = useState(false);
  const [session, setSession] = useState<
    (CheckoutStart & { client_secret: string }) | null
  >(null);
  const [returning, setReturning] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success",
  );
  // The flag lives in state only: a reload must not wait on Stripe again.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("checkout")) return;
    // Back from Checkout: the server pulls the session (the webhook can trail).
    const session = url.searchParams.get("session_id");
    if (session) void getSubscription(session).catch(() => {});
    url.searchParams.delete("checkout");
    url.searchParams.delete("session_id");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  // Stripe's webhook is usually seconds; past a minute stop waiting and show
  // the plan card again (with its way out) instead of spinning forever.
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
  // Pages still composing, the last visual check still looking, or a
  // just-paid plan waiting on Stripe's webhook.
  const waiting =
    !!state &&
    (state.building ||
      state.qa?.status === "checking" ||
      (returning && state.needs_plan));
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
      const res = await startCheckout(state.plan.id, "/setup");
      if (res.client_secret)
        setSession({ ...res, client_secret: res.client_secret });
      else window.location.href = res.checkout_url ?? "";
    },
    { errorToast: "Couldn’t open checkout. Try again." },
  );
  const { run: startNow, loading: starting } = useAsyncAction(
    async () => {
      const sub = await updateSubscription("start_now");
      if (sub.status !== "active")
        toast.error(
          "Your card couldn’t be charged yet. Check it with your bank and try again.",
        );
      await load();
    },
    { errorToast: "Couldn’t start your plan. Try again." },
  );
  const { run: sellLater, loading: holding } = useAsyncAction(
    async () => setState(await api.goliveAction("sell_later")),
    { errorToast: "Couldn’t hold your paid items back. Try again." },
  );
  const { run: publish, loading: publishing } = useAsyncAction(
    async () => {
      try {
        onPublished((await api.goliveAction("publish")).team);
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
      {state?.qa && <VisualCheck qa={state.qa} />}
      {session && state?.plan && (
        <EmbeddedCheckoutOverlay
          session={session}
          onClose={() => setSession(null)}
          aside={
            <CoachPlanAside
              title="Your site goes live next"
              plan={state.plan}
            />
          }
        />
      )}
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

  // Plan names are stored lowercase ("starter"); shown capitalised.
  const planName = (plan: { name: string }) =>
    plan.name.charAt(0).toUpperCase() + plan.name.slice(1);
  const day = (date: Date) =>
    date.toLocaleDateString(undefined, { month: "long", day: "numeric" });

  if (state.needs_plan && state.plan && state.plan.trial_days > 0) {
    const price = formatPrice(state.plan.amount_cents, state.plan.currency);
    const days = state.plan.trial_days;
    const firstCharge = day(new Date(Date.now() + days * 86_400_000));
    return shell(
      <>
        <p className="text-[15px] font-semibold">
          Start your {days}-day free trial
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
          {planName(state.plan)} is free until {firstCharge}
          {price ? `, then ${price} a month` : ""}. Add your card now: cancel
          any time before then and you won’t be charged. You’ll come straight
          back here.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => checkout()}
            loading={checkingOut}
            className="rounded-full px-6"
          >
            Start free trial
          </Button>
        </div>
      </>,
    );
  }

  if (state.needs_start && state.plan) {
    const price = formatPrice(state.plan.amount_cents, state.plan.currency);
    const ends = state.trial_end ? ` on ${day(new Date(state.trial_end))}` : "";
    return shell(
      <>
        <p className="text-[15px] font-semibold">
          Selling opens when your plan starts
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--sf-graphite)]">
          A trial can’t take payments. Start your {planName(state.plan)} plan
          today to sell right away{price ? ` (${price} a month)` : ""}, or go
          live now and sell once your trial ends{ends}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => startNow()}
            loading={starting}
            loadingText="Starting your plan…"
            className="rounded-full px-6"
          >
            Start my plan now
          </Button>
          {later}
        </div>
        {laterHint}
      </>,
    );
  }

  if (state.needs_plan && state.plan) {
    const price = formatPrice(state.plan.amount_cents, state.plan.currency);
    const name = planName(state.plan);
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
        </div>
        {laterHint}
      </>,
    );
  }

  if (state.needs_payouts) {
    return shell(
      <>
        <div className="h-[340px]">
          <PayoutsCard onReady={setPayoutsReady} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{later}</div>
        {laterHint}
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
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--sf-faint)]">
        You can keep editing your site after it goes live.
      </p>
    </>,
  );
}

/** Every step left before going live, the current one first in weight. */
/** The last look over the finished site: said while it runs (going live
 * never waits on it), then what it covered and what it tidied. */
function VisualCheck({ qa }: { qa: NonNullable<GoLiveState["qa"]> }) {
  if (qa.status === "failed") return null;
  const checking = qa.status === "checking";
  return (
    <div
      role="status"
      className="mt-4 flex gap-2.5 rounded-xl bg-[var(--sf-tint)] p-3 text-[13.5px] leading-relaxed"
    >
      {checking ? (
        <Spinner size="sm" className="mt-0.5 shrink-0 text-[var(--sf-brass)]" />
      ) : (
        <Check
          className="mt-0.5 size-4 shrink-0 text-[var(--sf-brass)]"
          aria-hidden
        />
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-medium">
          {checking && <SpecialistFace k="designer" size="sm" />}
          {checking
            ? "Giving every page a last look"
            : `I looked over ${qa.pages === 1 ? "your page" : `all ${qa.pages} pages`}`}
        </p>
        <p className="text-[var(--sf-graphite)]">
          {checking
            ? "On desktop and phone, in light and dark, so nothing looks off when you go live. You don’t have to wait for me."
            : qa.fixed.length
              ? "On desktop and phone, in light and dark. I tidied up along the way:"
              : "On desktop and phone, in light and dark."}
        </p>
        {!checking && qa.fixed.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[var(--sf-graphite)]">
            {qa.fixed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

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
