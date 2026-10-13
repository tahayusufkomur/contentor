"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock, Plus } from "lucide-react";

import { UnifiedCalendar } from "@/components/admin/calendar/unified-calendar";
import { DescribeIt } from "@/components/admin/describe-it";
import { useIsLocked } from "@/components/admin/entitlements-provider";
import { EventForm } from "@/components/admin/live/event-form";
import { EventsList } from "@/components/admin/live/events-list";
import {
  EVENT_KINDS,
  kindFromParams,
  type EventRow,
} from "@/components/admin/live/kinds";
import type { MediaBrowserHandle } from "@/components/admin/media-browser";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clientFetch } from "@/lib/api-client";
import { useAssistantApplied } from "@/lib/site-events";
import { useNavigate } from "@shared/navigation/navigation-provider";

export const dynamic = "force-dynamic";

/** Every class and event the coach runs, whatever it runs on: one list, one
 *  form, and the calendar as another view of the same things. */
export default function EventsPage() {
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const params = useSearchParams();
  const liveLocked = useIsLocked("live");
  const listRef = useRef<MediaBrowserHandle>(null);
  // The calendar has no refresh of its own: a new key remounts it.
  const [calendarKey, setCalendarKey] = useState(0);
  const reload = () => {
    listRef.current?.refresh();
    setCalendarKey((k) => k + 1);
  };

  const view = params.get("view") === "calendar" ? "calendar" : "list";
  const [creating, setCreating] = useState(params.get("new") === "1");
  useEffect(() => {
    if (params.get("new") === "1") setCreating(true);
  }, [params]);

  // A link from the assistant or the calendar names one event: open its form
  // above the list, which may have it on a later page or filtered away.
  const linkedId = params.get("event");
  const linkedKind = kindFromParams(params);
  const [linked, setLinked] = useState<EventRow | null>(null);
  const [linkMissing, setLinkMissing] = useState(false);
  useEffect(() => {
    setLinked(null);
    setLinkMissing(false);
    if (!linkedId || !linkedKind) return;
    let cancelled = false;
    clientFetch<Omit<EventRow, "kind">>(
      `${EVENT_KINDS[linkedKind].api}${linkedId}/`,
    )
      .then((found) => {
        if (!cancelled) setLinked({ ...found, kind: linkedKind });
      })
      .catch(() => {
        if (!cancelled) setLinkMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedId, linkedKind]);
  const closeLinked = () => {
    setLinked(null);
    setLinkMissing(false);
    navigate("/admin/live");
  };

  // The assistant scheduled, changed or took back a class (from the line
  // below or from its panel): reload the list. A refresh, not a remount, so
  // a form she has open stays open.
  useAssistantApplied(({ kind }) => {
    if (kind.includes("event")) reload();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("nav.items.liveEvents")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("events.subtitle")}
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("events.new")}
          </Button>
        )}
      </div>

      {liveLocked && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <p className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            {t("events.locked")}
          </p>
          <Button asChild size="sm" variant="outline">
            <NavLink href="/admin/billing">{t("events.upgrade")}</NavLink>
          </Button>
        </div>
      )}

      <DescribeIt kind="event" />

      {creating && (
        <EventForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {linked && (
        <EventForm
          key={`${linked.kind}-${linked.id}`}
          event={linked}
          onCancel={closeLinked}
          onSaved={() => {
            closeLinked();
            reload();
          }}
        />
      )}
      {linkMissing && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {t("events.linkMissing")}
        </p>
      )}

      {/* key remounts the tabs when ?view= changes under the same page. */}
      <Tabs defaultValue={view} key={view}>
        <TabsList>
          <TabsTrigger value="list">{t("events.views.list")}</TabsTrigger>
          <TabsTrigger value="calendar">
            {t("events.views.calendar")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <EventsList ref={listRef} />
        </TabsContent>
        <TabsContent value="calendar">
          <UnifiedCalendar key={calendarKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
