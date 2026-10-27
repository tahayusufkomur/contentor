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

interface EventDetailClientProps {
  event: CalendarEventDetail;
  isLoggedIn: boolean;
}

function formatFullDate(dateStr: string, tz: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
}

function EventStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "live":
    case "ongoing":
      return (
        <Badge variant="destructive" className="gap-1">
          <Radio className="h-3 w-3 animate-pulse" />
          Live Now
        </Badge>
      );
    case "ended":
      return <Badge variant="secondary">Ended</Badge>;
    case "scheduled":
      return <Badge variant="outline">Upcoming</Badge>;
    default:
      return null;
  }
}

export function EventDetailClient({
  event,
  isLoggedIn,
}: EventDetailClientProps) {
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
                {config.label}
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
              <span>{formatFullDate(event.scheduled_at, tz)}</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <Clock className="h-5 w-5 shrink-0" />
              <span>
                {formatTime(event.scheduled_at, tz)}
                {event.ended_at ? ` — ${formatTime(event.ended_at, tz)}` : ""}
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
                    Free trial
                  </Badge>
                )}
                <p className="font-display text-3xl font-bold">
                  {event.pricing_type === "free"
                    ? "Free"
                    : event.pricing_type === "subscription"
                      ? "Members only"
                      : formatMoney(
                          access.price || event.price,
                          access.currency || event.currency || "USD",
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
              {!isEnded && stateLine(access) && (
                <p className="text-center text-xs text-muted-foreground">
                  {stateLine(access)}
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
  // Event ended — no action
  if (isEnded) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        This event has ended.
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
            Sign in to join
          </NavLink>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {event.pricing_type === "free"
            ? "This event is free. Sign in to participate."
            : event.pricing_type === "subscription"
              ? "This event is for members. Sign in to join."
              : "Sign in to purchase or subscribe for access."}
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
          You can attend this event.
          {event.address ? " The address is in the details." : ""}
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
            Join Now
          </NavLink>
        </Button>
      );
    }
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          You have access to this event.
        </p>
        <p className="text-sm font-medium text-foreground">
          The event hasn&apos;t started yet. Come back when it&apos;s live to
          join!
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
          {freeTerms(opts.free.window)}
        </p>
      )}
      {unlockMethods.includes("purchase") && (
        <>
          <Button size="lg" className="w-full gap-2" asChild>
            <NavLink href="/store">
              <ShoppingCart className="h-4 w-4" />
              Buy for{" "}
              {formatMoney(
                opts?.purchase?.price ?? event.price,
                opts?.purchase?.currency ||
                  event.access_info.currency ||
                  undefined,
              )}
            </NavLink>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {purchaseTerms(opts?.purchase?.window)}
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
              Subscribe for Access
            </NavLink>
          </Button>
          {opts?.plans?.map((plan) => (
            <p
              key={plan.id}
              className="text-center text-xs text-muted-foreground"
            >
              {plan.name}: {planTerms(plan.window)}
            </p>
          ))}
        </>
      )}
      {!waiting && unlockMethods.length === 0 && (
        <Button size="lg" className="w-full gap-2" asChild>
          <NavLink href="/plans">
            <Zap className="h-4 w-4" />
            Get Access
          </NavLink>
        </Button>
      )}
      <p className="text-center text-xs text-muted-foreground">
        {isLive
          ? unlockMethods.includes("purchase")
            ? "Purchase or subscribe to join this live event."
            : "Subscribe to join this live event."
          : "Get access now so you're ready when it starts."}
      </p>
    </div>
  );
}
