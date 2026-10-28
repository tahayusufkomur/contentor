"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { SkeletonForm } from "@/components/ui/skeletons";
import { WindowEditor } from "@/components/admin/access/window-editor";
import {
  describe,
  linkPill,
  parsePrice,
  problems,
  type AccessPayload,
  type Window,
  type Ways,
} from "@/lib/access/ways";
import { currencySymbol } from "@/lib/format";
import { KIND_ROUTES } from "@/lib/focus/kinds";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";

const NEW_PLAN_HREF = "/admin/store/plans/new";

const hasWindow = (w: Window | null) => !!w && Object.keys(w).length > 0;

/** "49", "19.50": the amount with no ".00". */
const amount = (price: string) => Number(price).toFixed(2).replace(/\.00$/, "");

function planPrice(
  p: AccessPayload["plans"][number],
  currency: string,
  locale: string,
) {
  const m = p.billing_interval_months;
  const every = m === 1 ? "month" : m === 12 ? "year" : `${m} months`;
  return `${currencySymbol(currency, locale)}${amount(p.price)}/${every}`;
}

/** One way: its tick box, title, a right-hand control, and its body. */
function Way({
  id,
  title,
  sub,
  checked,
  onCheckedChange,
  fixed,
  disabled,
  right,
  covered,
  children,
}: {
  id: string;
  title: string;
  sub: string;
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  /** The only way this kind has: always on, so no tick box. */
  fixed?: boolean;
  disabled?: boolean;
  right?: ReactNode;
  covered?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-t px-5 py-3.5 first:border-t-0 motion-safe:transition-opacity",
        covered && "opacity-40",
      )}
    >
      <div className="grid grid-cols-[1.25rem_1fr_auto] items-start gap-x-2.5">
        {fixed ? (
          <span />
        ) : (
          <Checkbox
            id={id}
            className="mt-0.5"
            checked={checked}
            disabled={disabled}
            onCheckedChange={(v) => onCheckedChange(v === true)}
          />
        )}
        <div>
          <Label htmlFor={id} className="text-sm font-semibold">
            {title}
          </Label>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
        {right}
      </div>
      {children && <div className="ml-[1.875rem] mt-2.5">{children}</div>}
    </div>
  );
}

const Err = ({ children }: { children: ReactNode }) => (
  <div role="alert" className="mt-1.5 text-xs text-destructive">
    {children}
  </div>
);

/** What stops a save: the helpers' problems, plus a box with a bad day count or date. */
export type AccessProblem = {
  way: "buy" | "plans" | "free" | "all";
  text: string;
};
type Problems = AccessProblem[];

/**
 * How students get an item: the ways in, each with its timing. Controlled,
 * with no fetch and no save of its own; the form that owns the page loads it
 * with `useAccess` and saves it. `payload` null is still loading.
 * `onProblems` hears what stops a save (empty while there is none), including
 * the subscriptions box ticked with no plan chosen, which only this section knows.
 * `quietZeroPrice`: a price of 0 (or none yet) is not shown as an error, while
 * another question asks it (focus mode's guide); `onProblems` still hears it.
 */
export function AccessSection({
  payload,
  value,
  ...rest
}: {
  kind: string;
  value: Ways | null;
  onChange: (next: Ways) => void;
  payload: AccessPayload | null;
  onProblems?: (problems: Problems) => void;
  quietZeroPrice?: boolean;
}) {
  if (!payload || !value) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Access</CardTitle>
        </CardHeader>
        <CardContent>
          <SkeletonForm fields={3} />
        </CardContent>
      </Card>
    );
  }
  return <Loaded payload={payload} value={value} {...rest} />;
}

function Loaded({
  kind,
  value,
  onChange,
  payload,
  onProblems,
  quietZeroPrice = false,
}: {
  kind: string;
  value: Ways;
  onChange: (next: Ways) => void;
  payload: AccessPayload;
  onProblems?: (problems: Problems) => void;
  quietZeroPrice?: boolean;
}) {
  const locale = useLocale();
  // The In subscriptions box can be ticked before any plan is: a draft.
  const [plansDraft, setPlansDraft] = useState(false);
  const [refused, setRefused] = useState(false);
  // What a way held when it was unticked, so ticking it again brings it back.
  const kept = useRef<{ buy?: Ways["buy"]; free?: Ways["free"] }>({});

  useEffect(() => {
    setPlansDraft(false);
    setRefused(false);
    kept.current = {};
  }, [payload]);

  const has = (way: string) => payload.allowed.includes(way);
  const onlyBuy = payload.allowed.length === 1 && has("buy");
  const onlyFree = payload.allowed.length === 1 && has("free");
  const currency = payload.currency;
  const symbol = currencySymbol(currency, locale);

  // Only the ways this kind allows (the payload for a new item carries Free
  // for every kind). A kind with a single way always has it.
  const buy = has("buy")
    ? (value.buy ?? (onlyBuy ? { price: "", window: null } : null))
    : null;
  const free = has("free")
    ? (value.free ?? (onlyFree ? { window: null } : null))
    : null;
  const plans = has("plans") ? value.plans : [];
  const ways: Ways = { free, buy, plans };
  const plansTicked = plans.length > 0 || plansDraft;
  const count = (free ? 1 : 0) + (buy ? 1 : 0) + (plansTicked ? 1 : 0);
  const covering = !!free && !hasWindow(free.window) && !onlyFree;
  const found = problems(ways, payload.allowed, plansTicked);
  const buyError = found.find(
    (p) =>
      p.way === "buy" &&
      !(quietZeroPrice && Number((buy?.price ?? "").replace(",", ".")) === 0),
  );
  const plansError = found.find((p) => p.way === "plans");
  const allError = !refused && found.find((p) => p.way === "all");

  // Boxes holding a bad day count or date, by the way they belong to.
  const [badWindows, setBadWindows] = useState<Record<string, boolean>>({});
  const windowBad = (key: string) => (b: boolean) =>
    setBadWindows((prev) => (!!prev[key] === b ? prev : { ...prev, [key]: b }));
  const planName = (id: number) =>
    payload.plans.find((p) => p.id === id)?.name ?? "this subscription";
  const reportable: Problems = [
    ...found,
    ...Object.entries(badWindows)
      .filter(([, b]) => b)
      .map(([key]): AccessProblem => {
        const plan = key.startsWith("plan:") ? Number(key.slice(5)) : null;
        return {
          way: plan !== null ? "plans" : (key as "buy" | "free"),
          text: `Check the days or dates for ${
            plan !== null ? planName(plan) : key === "buy" ? "buyers" : "Free"
          }.`,
        };
      }),
  ];

  // Tell the form, only when the list changes; nothing once this goes away.
  const tell = useRef(onProblems);
  tell.current = onProblems;
  const reported = useRef("");
  const latest = useRef(reportable);
  latest.current = reportable;
  const reportKey = JSON.stringify(reportable);
  useEffect(() => {
    if (reported.current === reportKey) return;
    reported.current = reportKey;
    tell.current?.(latest.current);
  }, [reportKey]);
  useEffect(
    () => () => {
      // Forget what was told, so StrictMode's second mount tells it again.
      reported.current = "";
      tell.current?.([]);
    },
    [],
  );

  const change = (next: Partial<Ways>) => {
    setRefused(false);
    onChange({ ...ways, ...next });
  };
  /** Unticking the last way is refused. */
  const last = (on: boolean) => {
    if (!on && count === 1) {
      setRefused(true);
      return true;
    }
    return false;
  };

  /** Free with no window and nothing else: a new item's default, which the
   *  first paid tick replaces ("sell it for 29" is one tick and a price). */
  const freeAlone = !!free && !hasWindow(free.window) && !buy && !plans.length;
  const dropFreeAlone = (): Partial<Ways> => {
    if (!freeAlone || onlyFree) return {};
    kept.current.free = free;
    return { free: null };
  };

  const toggleBuy = (on: boolean) => {
    if (last(on)) return;
    if (!on) kept.current.buy = buy;
    change({
      buy: on ? (kept.current.buy ?? { price: "", window: null }) : null,
      ...(on && dropFreeAlone()),
    });
  };
  const toggleFree = (on: boolean) => {
    if (last(on)) return;
    if (!on) kept.current.free = free;
    change({ free: on ? (kept.current.free ?? { window: null }) : null });
  };
  const togglePlans = (on: boolean) => {
    if (last(on)) return;
    setPlansDraft(on);
    change(on ? {} : { plans: [] });
  };
  const togglePlan = (planId: number, on: boolean) => {
    setPlansDraft(true);
    change({
      plans: on
        ? [...plans, { plan_id: planId, window: null }]
        : plans.filter((p) => p.plan_id !== planId),
      ...(on && dropFreeAlone()),
    });
  };
  const setPlanWindow = (planId: number, window: Window | null) =>
    change({
      plans: plans.map((p) => (p.plan_id === planId ? { ...p, window } : p)),
    });

  const canEditPlans = payload.can_edit_plans;
  const newPlanHref = KIND_ROUTES.membership?.newHref ?? NEW_PLAN_HREF;
  const shown = buy
    ? { ...ways, buy: { ...buy, price: parsePrice(buy.price) ?? "0" } }
    : ways;

  return (
    // Focus mode's "Add a time limit" brings this into view.
    <Card data-access-section>
      <CardHeader className="pb-1">
        <CardTitle className="text-base">Access</CardTitle>
        <CardDescription>
          {onlyFree
            ? "Zoom sessions are free to join"
            : "How students get this. Tick every way in."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pt-3">
        {refused && (
          <div
            role="alert"
            className="mx-5 mb-2 rounded-lg bg-muted px-3 py-2 text-xs"
          >
            Keep at least one way ticked. A draft is hidden from students
            anyway, so you never need to untick them all.
          </div>
        )}
        {allError && (
          <div className="mx-5 mb-2 text-xs text-destructive">
            {allError.text}
          </div>
        )}

        {has("buy") && (
          <Way
            id={`access-${kind}-buy`}
            title="Sell it once"
            sub="Anyone can buy it for a one-time price."
            checked={!!buy}
            fixed={onlyBuy}
            onCheckedChange={toggleBuy}
            covered={covering}
            right={
              buy && (
                <div className="flex items-center gap-1.5">
                  <Label
                    htmlFor={`access-${kind}-price`}
                    className="text-xs text-muted-foreground"
                  >
                    Price
                  </Label>
                  <span className="text-sm text-muted-foreground">
                    {symbol}
                  </span>
                  <Input
                    id={`access-${kind}-price`}
                    inputMode="decimal"
                    value={buy.price}
                    aria-invalid={!!buyError}
                    className="h-9 w-24"
                    onChange={(e) =>
                      change({ buy: { ...buy, price: e.target.value } })
                    }
                  />
                </div>
              )
            }
          >
            {buy && (
              <>
                {buyError && <Err>{buyError.text}</Err>}
                <WindowEditor
                  mode="buy"
                  label="Buyers keep it"
                  value={buy.window}
                  onChange={(window) => change({ buy: { ...buy, window } })}
                  onInvalid={windowBad("buy")}
                  note="A purchase keeps these terms. Changing them later only affects new buyers."
                />
              </>
            )}
          </Way>
        )}

        {has("plans") && (
          <Way
            id={`access-${kind}-plans`}
            title="In subscriptions"
            sub="Members of the subscriptions you tick get it as part of what they pay."
            checked={plansTicked}
            disabled={!canEditPlans}
            onCheckedChange={togglePlans}
            covered={covering}
          >
            {(plansTicked || !canEditPlans) && (
              <>
                {!canEditPlans && (
                  <div className="mb-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Only the site owner changes which subscriptions include
                    this.
                  </div>
                )}
                {payload.plans.map((plan) => {
                  const link = plans.find((p) => p.plan_id === plan.id);
                  if (!canEditPlans && !link) return null;
                  const id = `access-${kind}-plan-${plan.id}`;
                  return (
                    <div
                      key={plan.id}
                      className="grid grid-cols-[1.25rem_1fr] gap-x-2.5 border-t border-dashed py-2.5 first:border-t-0 first:pt-0.5"
                    >
                      <Checkbox
                        id={id}
                        className="mt-0.5"
                        checked={!!link}
                        disabled={!canEditPlans}
                        onCheckedChange={(v) => togglePlan(plan.id, v === true)}
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-x-1.5">
                          <Label htmlFor={id} className="text-sm font-medium">
                            {plan.name}
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            · {planPrice(plan, currency, locale)}
                          </span>
                          {!plan.is_active && (
                            <Badge variant="outline" className="text-[11px]">
                              Off sale
                            </Badge>
                          )}
                        </div>
                        {link && (
                          <div className="mt-1.5">
                            {canEditPlans ? (
                              <WindowEditor
                                mode="plan"
                                label="Members get it"
                                value={link.window}
                                onChange={(w) => setPlanWindow(plan.id, w)}
                                onInvalid={windowBad(`plan:${plan.id}`)}
                                note={`This applies to current ${plan.name} members too, including those who already have it.`}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {linkPill(link.window, locale)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {canEditPlans && (
                  <div className="mt-2">
                    <NavLink
                      href={newPlanHref}
                      className="text-xs underline underline-offset-2"
                    >
                      + New subscription
                    </NavLink>
                  </div>
                )}
                {plansError && <Err>{plansError.text}</Err>}
              </>
            )}
          </Way>
        )}

        {has("free") && (
          <Way
            id={`access-${kind}-free`}
            title="Free"
            sub="Anyone signed in to the site can open it."
            checked={!!free}
            fixed={onlyFree}
            onCheckedChange={toggleFree}
          >
            {free && !onlyFree && (
              <>
                <WindowEditor
                  mode="free"
                  label="When"
                  value={free.window}
                  onChange={(window) => change({ free: { window } })}
                  onInvalid={windowBad("free")}
                />
                <div className="mt-2.5 text-xs text-muted-foreground">
                  {covering && (buy || plansTicked) ? (
                    <>
                      <b className="font-medium text-foreground">
                        Free for everyone covers every student,
                      </b>{" "}
                      so the ways above do nothing while this is on. Their
                      settings are kept for when you untick Free.
                    </>
                  ) : !covering && (buy || plansTicked) ? (
                    "While the free window is open anyone can start it. Outside it, the ways above apply."
                  ) : !covering ? (
                    "Outside the free window nobody can open it, since nothing else is ticked."
                  ) : null}
                </div>
              </>
            )}
          </Way>
        )}

        {payload.bundles.length > 0 && (
          <div className="border-t px-5 py-3 text-sm text-muted-foreground">
            Also in a bundle:{" "}
            {payload.bundles.map((b, i) => (
              <span key={b.id}>
                {i > 0 && ", "}
                <NavLink
                  href={`/admin/store/bundles/${b.id}`}
                  className="text-foreground underline underline-offset-2"
                >
                  {b.name} · {symbol}
                  {amount(b.price)}
                </NavLink>
              </span>
            ))}
            . Bundles have their own page.
          </div>
        )}

        <div className="mx-5 flex items-baseline gap-2.5 border-t pb-4 pt-3">
          <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-primary">
            In short
          </span>
          <span className="text-sm">
            {count > 0
              ? describe(shown, payload.plans, currency, locale)
              : "Nothing ticked yet."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
