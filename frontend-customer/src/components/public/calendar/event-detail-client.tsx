"use client";

import {
  Calendar,
  Clock,
  LogIn,
  MapPin,
  Radio,
  ShoppingCart,
  Video,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { NavLink } from "@/components/ui/nav-link";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import {
  freeTerms,
  planTerms,
  purchaseTerms,
  stateLine,
} from "@/lib/access/terms";
import { CoverArt } from "@/components/covers/cover-art";
import { useTenant } from "@/hooks/use-tenant";
import { eventItem } from "@/lib/covers/items";
import { EVENT_TYPE_CONFIG } from "@/lib/event-colors";
import { formatTime } from "@/lib/calendar-utils";
import type { CalendarEventDetail } from "@/types/live";
import { useLocale, useTranslations } from "next-intl";

interface EventDetailClientProps {
  event: CalendarEventDetail;
  isLoggedIn: boolean;
}

function formatFullDate(dateStr: string, tz: string, locale: string): string {
  return new Date(dateStr).toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
}

function EventStatusBadge({ status }: { status: string }) {
  const t = useTranslations("site");
  switch (status) {
    case "live":
    case "ongoing":
      return (
        <Badge variant="destructive" className="gap-1">
          <Radio className="h-3 w-3 animate-pulse" />
          {t("eventPage.liveNow")}
        </Badge>
      );
    case "ended":
      return <Badge variant="secondary">{t("eventPage.ended")}</Badge>;
    case "scheduled":
      return <Badge variant="outline">{t("eventPage.upcoming")}</Badge>;
    default:
      return null;
  }
}

export function EventDetailClient({
  event,
  isLoggedIn,
}: EventDetailClientProps) {
  const locale = useLocale();
  const t = useTranslations("site");
  const tenantConfig = useTenant();
  const tz = tenantConfig?.timezone || "UTC";
  const config = EVENT_TYPE_CONFIG[event.type];
  const access = event.access_info;
  const isLive = event.status === "live" || event.status === "ongoing";
  const isEnded = event.status === "ended";
  const isScheduled = event.status === "scheduled";

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* The kept cover design (drawn live, it leads the page), the photo, or a gradient hero */}
          {event.cover_design ? (
            <div className="relative h-64 overflow-hidden rounded-[var(--radius)] md:h-80">
              <CoverArt
                design={event.cover_design}
                item={eventItem(event, tz)}
                priority
              />
            </div>
          ) : event.thumbnail_signed_url ? (
            <div className="overflow-hidden rounded-[var(--radius)]">
              <img
                src={event.thumbnail_signed_url}
                alt={event.title}
                className="h-64 w-full object-cover md:h-80"
              />
            </div>
          ) : (
            <div
              className={cn(
                "relative flex h-64 items-center justify-center overflow-hidden rounded-[var(--radius)] md:h-80",
                "bg-gradient-to-br from-primary/20 to-accent/10",
              )}
            >
              <Video className="h-20 w-20 text-primary/30" />
            </div>
          )}

          {/* Event info */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded",
                  config.textClass,
                  config.bgClass,
                )}
              >
                {t(config.labelKey)}
              </span>
              <EventStatusBadge status={event.status} />
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              {event.title}
            </h1>

            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {event.description}
            </p>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Calendar className="h-5 w-5 shrink-0" />
              <span>{formatFullDate(event.scheduled_at, tz, locale)}</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <Clock className="h-5 w-5 shrink-0" />
              <span>
                {formatTime(event.scheduled_at, locale, tz)}
                {event.ended_at
                  ? ` — ${formatTime(event.ended_at, locale, tz)}`
                  : ""}
              </span>
            </div>
            {(event.location || event.address) && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <MapPin className="h-5 w-5 shrink-0" />
                <span>
                  {[event.location, event.address].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sticky sidebar - action card */}
        <div>
          <Card className="sticky top-24 rounded-[var(--radius)] ring-1 ring-primary/10">
            <CardContent className="p-6 space-y-4">
              {/* Price */}
              <div className="text-center">
                {event.is_trial && (
                  <Badge variant="success" className="mb-2">
                    {t("price.freeTrial")}
                  </Badge>
                )}
                <p className="font-display text-3xl font-bold">
                  {event.pricing_type === "free"
                    ? t("price.free")
                    : event.pricing_type === "subscription"
                      ? t("price.membersOnly")
                      : formatMoney(
                          access.price || event.price,
                          access.currency || event.currency || "USD",
                          locale,
                        )}
                </p>
              </div>

              <Separator />

              {/* Action */}
              <EventAction
                event={event}
                hasAccess={access.has_access}
                isLoggedIn={isLoggedIn}
                isLive={isLive}
                isEnded={isEnded}
                isScheduled={isScheduled}
              />
              {!isEnded && stateLine(access, locale, t) && (
                <p className="text-center text-xs text-muted-foreground">
                  {stateLine(access, locale, t)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EventAction({
  event,
  hasAccess,
  isLoggedIn,
  isLive,
  isEnded,
  isScheduled,
}: {
  event: CalendarEventDetail;
  hasAccess: boolean;
  isLoggedIn: boolean;
  isLive: boolean;
  isEnded: boolean;
  isScheduled: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("site");
  // Event ended — no action
  if (isEnded) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        {t("eventPage.hasEnded")}
      </p>
    );
  }

  // Anonymous user — must sign in first
  if (!isLoggedIn) {
    return (
      <div className="space-y-3">
        <Button asChild size="lg" className="w-full gap-2">
          <NavLink href="/login">
            <LogIn className="h-4 w-4" />
            {t("eventPage.signInToJoin")}
          </NavLink>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {event.pricing_type === "free"
            ? t("eventPage.freeSignIn")
            : event.pricing_type === "subscription"
              ? t("eventPage.membersSignIn")
              : t("eventPage.purchaseSignIn")}
        </p>
      </div>
    );
  }

  // Logged in + has access (free, purchased, subscribed, or owner/coach)
  if (hasAccess) {
    // Held in person: there is nothing to join online.
    if (event.type === "onsite_event") {
      return (
        <p className="text-center text-sm text-muted-foreground">
          {event.address
            ? t("eventPage.canAttendAddress")
            : t("eventPage.canAttend")}
        </p>
      );
    }
    if (isLive) {
      const joinHref =
        event.type === "live_stream"
          ? `/live-stream/${event.id}`
          : `/live/${event.id}`;
      return (
        <Button asChild size="lg" className="w-full gap-2">
          <NavLink href={joinHref}>
            <Video className="h-4 w-4" />
            {t("eventPage.joinNow")}
          </NavLink>
        </Button>
      );
    }
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          {t("eventPage.haveAccess")}
        </p>
        <p className="text-sm font-medium text-foreground">
          {t("eventPage.notStarted")}
        </p>
      </div>
    );
  }

  // Logged in but no access — show buy/subscribe options
  const unlockMethods = event.access_info.unlock_methods ?? [];
  const opts = event.unlock_options;
  // A member whose way opens later waits for it, but may still buy.
  const waiting = !!event.access_info.opens_at;

  return (
    <div className="space-y-3">
      {opts?.free && (
        <p className="text-center text-sm font-medium">
          {freeTerms(opts.free.window, locale, t)}
        </p>
      )}
      {unlockMethods.includes("purchase") && (
        <>
          <Button size="lg" className="w-full gap-2" asChild>
            <NavLink href="/store">
              <ShoppingCart className="h-4 w-4" />
              {t("price.buyFor", {
                price: formatMoney(
                  opts?.purchase?.price ?? event.price,
                  opts?.purchase?.currency ||
                    event.access_info.currency ||
                    "USD",
                  locale,
                ),
              })}
            </NavLink>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {purchaseTerms(opts?.purchase?.window, locale, t)}
          </p>
        </>
      )}
      {!waiting && unlockMethods.includes("subscribe") && (
        <>
          <Button
            size="lg"
            className="w-full gap-2"
            variant={unlockMethods.includes("purchase") ? "outline" : "default"}
            asChild
          >
            <NavLink href="/plans">
              <Zap className="h-4 w-4" />
              {t("eventPage.subscribeForAccess")}
            </NavLink>
          </Button>
          {opts?.plans?.map((plan) => (
            <p
              key={plan.id}
              className="text-center text-xs text-muted-foreground"
            >
              {plan.name}: {planTerms(plan.window, locale, t)}
            </p>
          ))}
        </>
      )}
      {!waiting && unlockMethods.length === 0 && (
        <Button size="lg" className="w-full gap-2" asChild>
          <NavLink href="/plans">
            <Zap className="h-4 w-4" />
            {t("eventPage.getAccess")}
          </NavLink>
        </Button>
      )}
      <p className="text-center text-xs text-muted-foreground">
        {isLive
          ? unlockMethods.includes("purchase")
            ? t("eventPage.purchaseOrSubscribeLive")
            : t("eventPage.subscribeLive")
          : t("eventPage.getAccessNow")}
      </p>
    </div>
  );
}
