"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, ExternalLink, Pencil, Play, Square } from "lucide-react";
import { toast } from "sonner";

import {
  MediaBrowser,
  type FetchPageParams,
  type FetchPageResult,
  type MediaBrowserHandle,
} from "@/components/admin/media-browser";
import { TagFilterBar } from "@/components/admin/tag-filter-bar";
import { DemoBadge } from "@/components/setup/demo-badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { batchedAsync, clientFetch } from "@/lib/api-client";
import { useTenantCurrency } from "@/lib/setup-assistant";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

import { EventForm } from "./event-form";
import {
  EVENT_KINDS,
  displayStatus,
  type EventKind,
  type EventRow,
} from "./kinds";
import { PricingBadge, StatusBadge, formatDate } from "./shared";

type When = "upcoming" | "past";

/** An event's id is only unique within its kind. */
const rowKey = (event: EventRow) => `${event.kind}-${event.id}`;

/** Every class and event in one list, whatever it runs on. */
export const EventsList = forwardRef<MediaBrowserHandle>(
  function EventsList(_props, ref) {
    const t = useTranslations("admin.events");
    const currency = useTenantCurrency();
    const browserRef = useRef<MediaBrowserHandle>(null);
    useImperativeHandle(ref, () => ({
      refresh: () => browserRef.current?.refresh(),
    }));
    const [when, setWhen] = useState<When>("upcoming");
    const [tagFilter, setTagFilter] = useState<number[]>([]);
    const [editing, setEditing] = useState<string | null>(null);

    const fetchPage = useCallback(
      async (params: FetchPageParams): Promise<FetchPageResult<EventRow>> => {
        const sp = new URLSearchParams({
          limit: String(params.limit),
          offset: String(params.offset),
          // "By date" means nearest to today first: soonest for what is
          // ahead, most recent for what is behind.
          ordering:
            params.ordering === "scheduled_at" && when === "past"
              ? "-scheduled_at"
              : params.ordering,
          when,
        });
        if (params.search) sp.set("search", params.search);
        if (tagFilter.length) sp.set("tags", tagFilter.join(","));
        const data = await clientFetch<{
          results: EventRow[];
          next: string | null;
          count: number;
        }>(`/api/v1/admin/events/?${sp}`);
        return { results: data.results, next: data.next, count: data.count };
      },
      [when, tagFilter],
    );

    return (
      <MediaBrowser<EventRow>
        ref={browserRef}
        persistKey="events"
        galleryEnabled={false}
        fetchPage={fetchPage}
        filterKey={`${when}:${tagFilter.join(",")}`}
        filterSlot={
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label={t("whenFilter")}
              className="inline-flex rounded-lg border border-border p-0.5 text-sm"
            >
              {(["upcoming", "past"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={when === value}
                  onClick={() => setWhen(value)}
                  className={`rounded-md px-3 py-1 ${when === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t(value)}
                </button>
              ))}
            </div>
            <TagFilterBar
              scope="event"
              value={tagFilter}
              onChange={setTagFilter}
            />
          </div>
        }
        sortOptions={[
          { label: t("sort.date"), value: "scheduled_at" },
          { label: t("sort.newest"), value: "-created_at" },
          { label: t("sort.nameAZ"), value: "title" },
          { label: t("sort.nameZA"), value: "-title" },
        ]}
        defaultSort="scheduled_at"
        emptyIcon={CalendarDays}
        emptyMessage={t(when === "past" ? "emptyPast" : "empty")}
        getItemId={rowKey}
        onDelete={async (selection) => {
          // Only the owner may delete: say what really happened.
          const outcomes = await batchedAsync(
            selection.ids.map((key) => () => {
              const [kind, id] = String(key).split("-");
              return clientFetch(
                `${EVENT_KINDS[kind as EventKind].api}${id}/`,
                {
                  method: "DELETE",
                },
              ).then(
                () => true,
                () => false,
              );
            }),
          );
          const failed = outcomes.filter((ok) => !ok).length;
          const deleted = outcomes.length - failed;
          if (deleted) toast.success(t("deleted", { count: deleted }));
          if (failed) toast.error(t("deleteRefused", { count: failed }));
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: t("col.status"), key: "status" },
          { label: t("col.title"), key: "title" },
          { label: t("col.when"), key: "when" },
          { label: t("col.where"), key: "where" },
          { label: t("col.price"), key: "price" },
          { label: t("col.actions"), key: "actions" },
        ]}
        renderListRow={(event) => {
          const status = displayStatus(event);
          const Icon = EVENT_KINDS[event.kind].icon;
          return (
            <>
              <TableCell>
                <StatusBadge status={status} label={t(`status.${status}`)} />
              </TableCell>
              <TableCell className="font-medium">
                <div className="min-w-0">
                  <div className="truncate">
                    {event.title}
                    <DemoBadge
                      type={EVENT_KINDS[event.kind].demo}
                      id={event.id}
                    />
                  </div>
                  {event.description && (
                    <p className="max-w-md truncate text-xs text-muted-foreground">
                      {event.description}
                    </p>
                  )}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(event.scheduled_at)}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {(event.kind === "onsite" && event.location) ||
                    t(`kinds.${event.kind}.label`)}
                </span>
              </TableCell>
              <TableCell>
                {event.is_trial ? (
                  <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {t("trial")}
                  </span>
                ) : (
                  <PricingBadge
                    pricingType={event.pricing_type}
                    price={event.price}
                    currency={currency}
                    labels={{ free: t("free"), membersOnly: t("membersOnly") }}
                  />
                )}
              </TableCell>
              <TableCell>
                <RowActions
                  event={event}
                  onEdit={() => setEditing(rowKey(event))}
                  onChanged={() => browserRef.current?.refresh()}
                />
              </TableCell>
            </>
          );
        }}
        renderExpandedRow={(event) =>
          editing === rowKey(event) ? (
            <TableRow>
              <TableCell colSpan={7} className="bg-muted/30 p-3">
                <EventForm
                  event={event}
                  onCancel={() => setEditing(null)}
                  onTrialChanged={() => browserRef.current?.refresh()}
                  onSaved={() => {
                    setEditing(null);
                    browserRef.current?.refresh();
                  }}
                />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    );
  },
);

/** What she can do with a row follows where it happens: a built-in class or
 *  stream is started and ended here; a Zoom class opens its link. Each row
 *  has its own loading state. */
function RowActions({
  event,
  onEdit,
  onChanged,
}: {
  event: EventRow;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("admin.events");
  const navigate = useNavigate();
  const { api, room } = EVENT_KINDS[event.kind];

  const { run: start, loading: starting } = useAsyncAction(
    async () => {
      await clientFetch(`${api}${event.id}/start/`, { method: "POST" });
      navigate(room!(event.id));
    },
    { errorToast: t("startError") },
  );
  const { run: stop, loading: stopping } = useAsyncAction(
    async () => {
      await clientFetch(`${api}${event.id}/stop/`, { method: "POST" });
      toast.success(t("stopped"));
      onChanged();
    },
    { errorToast: t("stopError") },
  );

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={onEdit} className="gap-1.5">
        <Pencil className="h-3.5 w-3.5" /> {t("edit")}
      </Button>
      {room && (event.status === "draft" || event.status === "scheduled") && (
        <Button
          size="sm"
          onClick={start}
          loading={starting}
          loadingText={t("starting")}
          className="gap-1.5"
        >
          <Play className="h-3.5 w-3.5" /> {t("goLive")}
        </Button>
      )}
      {room && event.status === "live" && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(room(event.id))}
          >
            {t("join")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={stop}
            loading={stopping}
            loadingText={t("ending")}
            className="gap-1.5"
          >
            <Square className="h-3.5 w-3.5" /> {t("end")}
          </Button>
        </>
      )}
      {event.zoom_link && (
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <a href={event.zoom_link} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> {t("openZoom")}
          </a>
        </Button>
      )}
    </div>
  );
}
