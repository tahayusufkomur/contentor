"use client";

import { useMemo, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { X } from "lucide-react";
import { formatPlanName, formatPlanPrice } from "../lib/format-plan-price";
import { APEX, Mark } from "../ui/contentor-brand";
import { ModalPortal } from "../ui/modal-portal";
import { Spinner } from "../ui/spinner";
import { useLocale } from "next-intl";

/** What a checkout endpoint answers: an embedded session (mounted here) or,
 *  while the server has no publishable key, Stripe's hosted page to go to.
 *  `stripe_account` is the coach's account a direct charge's session lives on. */
export interface CheckoutStart {
  checkout_url?: string | null;
  client_secret?: string;
  publishable_key?: string;
  stripe_account?: string;
}

/** Stripe's form on the right, our panel on the left (above it on a phone),
 *  over every other layer (the top modal is z-[140]) but the toasts. Paying
 *  takes the whole page to the session's return URL, as the hosted page did;
 *  closing is the old cancel. */
export function EmbeddedCheckoutOverlay({
  session,
  aside,
  onClose,
}: {
  session: CheckoutStart & { client_secret: string };
  aside: ReactNode;
  onClose: () => void;
}) {
  const { publishable_key = "", stripe_account } = session;
  const stripe = useMemo(
    () =>
      loadStripe(
        publishable_key,
        stripe_account ? { stripeAccount: stripe_account } : undefined,
      ),
    [publishable_key, stripe_account],
  );
  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Checkout"
        className="fixed inset-0 z-[150] overflow-y-auto bg-white text-neutral-900 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
      >
        {aside}
        <div className="relative px-4 pb-10 pt-6 sm:px-8 lg:pt-16">
          {/* Fixed: on a phone the panel scrolls away above the form. */}
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="fixed right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-neutral-600 shadow-sm hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
          >
            <X className="h-4 w-4" aria-hidden />
            Close
          </button>
          <div className="relative mx-auto max-w-[480px]">
            {/* Stripe's form paints over this once it has loaded. */}
            <Spinner
              label="Loading checkout"
              className="absolute left-1/2 top-24 -translate-x-1/2 text-neutral-400"
            />
            <EmbeddedCheckoutProvider
              stripe={stripe}
              options={{ clientSecret: session.client_secret }}
            >
              <EmbeddedCheckout className="relative" />
            </EmbeddedCheckoutProvider>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export interface CheckoutStep {
  when: string;
  what: string;
}

/** The panel beside Stripe's form: one photograph, full bleed, washed in
 *  `tint` from the bottom so `ink` text reads over any photo; then what
 *  happens next, in order. `mark` sits on a page-coloured pill, the ground
 *  a logo is drawn for. */
export function CheckoutAside({
  photo,
  tint,
  ink,
  accent = ink,
  mark,
  title,
  steps,
}: {
  photo?: string | null;
  tint: string;
  ink: string;
  accent?: string;
  mark: ReactNode;
  title: string;
  steps: CheckoutStep[];
}) {
  return (
    <aside
      className="relative flex min-h-[360px] flex-col justify-between gap-10 overflow-hidden p-6 sm:p-10 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:gap-16"
      style={{ background: tint, color: ink }}
    >
      {photo && (
        <img
          src={photo}
          alt=""
          decoding="async"
          // A cart keeps signed URLs past their hour: show the colour instead.
          onError={(e) => (e.currentTarget.hidden = true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, ${tint} 42%, color-mix(in oklab, ${tint} 60%, transparent) 68%, transparent 92%)`,
        }}
      />
      <div className="relative inline-flex w-fit items-center rounded-full bg-background px-3.5 py-1.5 text-foreground">
        {mark}
      </div>
      <div className="relative max-w-md">
        <h2 className="font-display text-2xl leading-tight text-balance sm:text-4xl">
          {title}
        </h2>
        <ol className="mt-5 space-y-3 sm:mt-8 sm:space-y-5">
          {steps.map((step, i) => (
            <li key={step.when} className="relative pl-7">
              <span
                aria-hidden
                className="absolute left-0 top-1.5 h-3 w-3 rounded-full"
                style={{ background: accent }}
              />
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -bottom-2.5 left-[5px] top-6 w-0.5 rounded-full opacity-40 sm:-bottom-4"
                  style={{ background: ink }}
                />
              )}
              <p className="font-semibold">{step.when}</p>
              <p className="mt-0.5 opacity-90">{step.what}</p>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

export interface PlanTerms {
  name: string;
  currency: string;
  amount_cents: number | null;
  trial_days: number;
}

/** A coach's own plan: Contentor's panel, deep teal with brass, and the
 *  plan's timeline under `title`, over her own photo or a creator's kept
 *  beside the landing's stills (served by the apex, so the tenant app can
 *  show it too): Pix4Less 08450a43's 4K upscale, cut 4:5 at 2048 px with
 *  her face in the top quarter, above the wash. */
export function PlanCheckoutAside({
  photo = `${APEX}/media/stills/checkout-creator.avif`,
  title,
  plan,
}: {
  photo?: string | null;
  title: string;
  plan: PlanTerms;
}) {
  const locale = useLocale();
  return (
    <CheckoutAside
      photo={photo}
      tint="oklch(0.4 0.09 190)"
      ink="white"
      accent="oklch(0.83 0.12 85)"
      mark={
        <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Mark className="size-5" />
          Contentor
        </span>
      }
      title={title}
      steps={planSteps(plan, locale)}
    />
  );
}

/** A trial is free today and starts on its last day unless cancelled; a
 *  plan without one is charged today. */
function planSteps(plan: PlanTerms, locale: string): CheckoutStep[] {
  const name = formatPlanName(plan.name);
  const price = plan.amount_cents
    ? `${formatPlanPrice(plan.currency, plan.amount_cents, locale)} a month`
    : "its monthly price";
  if (!plan.trial_days) {
    return [
      { when: "Today", what: `${name} starts at ${price}.` },
      {
        when: "Every month after",
        what: "It renews on its own. Cancel any time from Billing.",
      },
    ];
  }
  const date = new Date(
    Date.now() + plan.trial_days * 86_400_000,
  ).toLocaleDateString(locale, { month: "long", day: "numeric" });
  return [
    {
      when: "Today",
      what: `Nothing to pay. Your ${plan.trial_days} free days start now.`,
    },
    {
      when: `Until ${date}`,
      what: "Try everything. Cancel from Billing and you pay nothing.",
    },
    { when: date, what: `${name} begins at ${price}.` },
  ];
}
