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
import { FocusStart } from "@/components/focus/focus-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clientFetch } from "@/lib/api-client";
import { startActiveTime, takeActiveMs } from "@/lib/focus/active-time";
import { fetchCreation, postFormTiming } from "@/lib/focus/api";
import { focusTimeKey, KIND_ROUTES } from "@/lib/focus/kinds";
import {
  activeCreation,
  clearActiveCreation,
  openCreationAt,
  pendingCreation,
  setActiveCreation,
  useActiveCreation,
  useFocusOverview,
} from "@/lib/focus/store";
import { useAssistantApplied } from "@/lib/site-events";
import { useNavigate } from "@shared/navigation/navigation-provider";

const FORM_TIME_KEY = "form:new-event";

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

  // Focus mode (switched on for events): New asks one question at a time;
  // ?form=1 is today's form ("Fill it in myself").
  const overview = useFocusOverview();
  const active = useActiveCreation();
  const first = overview?.first.event;
  const focusOn = !!overview?.enabled && !!first;
  const plain = params.get("form") === "1";
  const asNew = params.get("new") === "1" && !plain;
  const focusNew = focusOn && asNew;
  // Until the overview says which, a New link shows neither.
  const deciding = overview === null && asNew;
  // With focus mode on, today's create form is only "Fill it in myself".
  const plainOpen = creating && !deciding && (!focusOn || plain);
  useEffect(() => {
    if (!plainOpen || !focusOn) return;
    clearActiveCreation(0); // from the focus screen's "Fill it in myself"
    startActiveTime(FORM_TIME_KEY, true);
  }, [plainOpen, focusOn]);

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

  // A class she is still making in focus mode reopens there, where she
  // stopped; the guide and its form follow the creation from here.
  const linkedPath =
    linkedId && linkedKind
      ? `/admin/live?event=${linkedId}&kind=${linkedKind}`
      : null;
  const creationId = linkedPath
    ? (openCreationAt(overview, linkedPath) ??
      (active?.record?.path === linkedPath ? active.id : null))
    : null;
  useEffect(() => {
    if (!creationId) return;
    startActiveTime(focusTimeKey("event"));
    if (activeCreation()?.id === creationId) return; // just made on the new page
    let cancelled = false;
    fetchCreation(creationId)
      .then((state) => {
        if (!cancelled && state.status === "active") setActiveCreation(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creationId]);
  const focusing =
    !!linked &&
    !!active &&
    active.id !== 0 &&
    active.record?.path === linkedPath;
  // Her answers write the event (its date, place, price, cover; the copy):
  // the form takes the new copy, keeping what she changed. Once more when it ends.
  const written = focusing
    ? `${active.answered.map((l) => `${l.field}:${l.label}`).join("|")}|${active.copy?.status}`
    : "";
  const refreshLinked = () => {
    if (!linked) return;
    clientFetch<Omit<EventRow, "kind">>(
      `${EVENT_KINDS[linked.kind].api}${linked.id}/`,
    )
      .then((found) => setLinked({ ...found, kind: linked.kind }))
      .catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refreshLinked, [written]);
  const copy = active?.copy;
  const focus =
    focusing && linked
      ? {
          record: `${linked.kind}:${linked.id}`,
          // A failed or stopped run is not replayed: the page keeps what is saved.
          runId:
            copy?.status === "building" || copy?.status === "ready"
              ? copy.run
              : null,
          schedule:
            active.answered.find((line) => line.field === "when")?.label ??
            null,
        }
      : undefined;
  const pendingTitle = overview?.open.find((c) => c.id === active?.id)?.title;

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
        {!creating && !focusNew && !focusing && (
          <Button
            onClick={() =>
              focusOn
                ? navigate(KIND_ROUTES.event?.newHref ?? "/admin/live?new=1")
                : setCreating(true)
            }
            className="gap-2"
          >
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

      {/* Focus mode replaces it. */}
      {!focusOn && overview !== null && <DescribeIt kind="event" />}

      {deciding && <Skeleton className="h-48 w-full" />}
      {focusNew && first && (
        <FocusStart
          kind="event"
          question={first}
          resume={pendingCreation(overview, "event")}
        >
          <EventSlots title={active?.id ? (pendingTitle ?? "") : ""} />
        </FocusStart>
      )}

      {plainOpen && (
        <EventForm
          onCancel={() => setCreating(false)}
          onCreated={(id, kind) => {
            if (focusOn)
              void postFormTiming(
                "event",
                id,
                takeActiveMs(FORM_TIME_KEY),
                kind,
              ).catch(() => {});
          }}
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
          focus={focus}
          onCancel={closeLinked}
          onSaved={() => {
            if (focusing) return refreshLinked(); // she stays on it; the guide goes on
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
      {!focusNew && !focusing && (
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
      )}
    </div>
  );
}

/** The event form, still empty, before her answers make the draft (G10): her
 *  working title, and the rest to come. */
function EventSlots({ title }: { title: string }) {
  const t = useTranslations("admin.events");
  const slot = "rounded-md border border-dashed border-border bg-muted/30";
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-2">
          <Label>{t("where")}</Label>
          <div className={`h-9 ${slot}`} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-title">{t("title")}</Label>
          <Input id="event-title" value={title} readOnly />
        </div>
        <div className="space-y-2">
          <Label>{t("description")}</Label>
          <div className={`h-16 ${slot}`} />
        </div>
        <div className="space-y-2">
          <Label>{t("when")}</Label>
          <div className={`h-9 sm:max-w-xs ${slot}`} />
        </div>
      </CardContent>
    </Card>
  );
}
