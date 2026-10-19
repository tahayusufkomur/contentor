"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { FilterPicker } from "@/components/admin/filter-picker";
import { CoverStep } from "@/components/focus/cover-step";
import { WorkingTag } from "@/components/focus/working-tag";
import { TagInput } from "@/components/admin/tag-input";
import { CoverThumb } from "@/components/studio/cover-thumb";
import { OpenStudioButton } from "@/components/studio/open-studio-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/hooks/use-tenant";
import { clientFetch } from "@/lib/api-client";
import { useLiveRecord } from "@/lib/copilot/live";
import { listedItem } from "@/lib/covers/items";
import { setFocusSave, useActiveCreation } from "@/lib/focus/store";
import { useTenantCurrency } from "@/lib/setup-assistant";
import { ApiError } from "@/types/api";
import { useAsyncAction } from "@shared/hooks/use-async-action";

import { toLocalDatetimeValue } from "./shared";
import {
  EVENT_KINDS,
  KIND_ORDER,
  type EventKind,
  type EventRow,
} from "./kinds";

const selectClasses =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60";

/** What the server said, when it said something a coach can act on: its
 *  `detail`, or the first field's first message. */
function serverMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  for (const value of Object.values(err.data)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first) return first;
  }
  return null;
}

/** The form's fields as `event` has them. */
const fieldsOf = (event?: EventRow) => ({
  title: event?.title ?? "",
  description: event?.description ?? "",
  scheduled_at: toLocalDatetimeValue(event?.scheduled_at ?? null),
  pricing_type: event?.pricing_type ?? "free",
  price: event && Number(event.price) > 0 ? event.price : "",
  auto_recording: event?.auto_recording ?? false,
  zoom_link: event?.zoom_link ?? "",
  location: event?.location ?? "",
  address: event?.address ?? "",
  max_capacity: event?.max_capacity ? String(event.max_capacity) : "",
});
type Fields = ReturnType<typeof fieldsOf>;
const ids = (items?: { id: number }[]) =>
  JSON.stringify((items ?? []).map((item) => item.id).sort());

/** The one form for a class or event, new or existing. "Where it happens"
 *  picks the kind and shows that kind's own fields; it is fixed once the
 *  event exists, because each kind lives in its own table. */
export function EventForm({
  event,
  onSaved,
  onCancel,
  onCreated,
  focus,
}: {
  /** Omitted: a new event. */
  event?: EventRow;
  onSaved: () => void;
  onCancel: () => void;
  /** Create mode: the new row's id and kind (before onSaved). */
  onCreated?: (id: number, kind: EventKind) => void;
  /** Focus mode: the record the copy run writes ("<kind>:<id>"), that run,
   *  replayed live here, her schedule as one line, and how to load the event
   *  again (once the replay has shown it all, the saved copy takes over). */
  focus?: {
    record: string;
    runId: number | null;
    schedule: string | null;
    reload: () => void;
  };
}) {
  const t = useTranslations("admin.events");
  const tf = useTranslations("admin.focus");
  const currency = useTenantCurrency();
  const timeZone = useTenant()?.timezone || "UTC";
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "live");
  const [form, setForm] = useState(() => fieldsOf(event));
  // The fields as the server last had them. A newer copy of the event (focus
  // mode's answers write it) takes every field she has not changed.
  const base = useRef<Fields>(form);
  useEffect(() => {
    const next = fieldsOf(event);
    const was = base.current;
    base.current = next;
    setForm((mine) => {
      const merged: Record<string, unknown> = { ...mine };
      for (const key of Object.keys(next) as (keyof Fields)[])
        if (mine[key] === was[key]) merged[key] = next[key];
      return merged as Fields;
    });
  }, [event]);
  const [filterOptionIds, setFilterOptionIds] = useState<number[]>(
    (event?.filter_options ?? []).map((o) => o.id),
  );
  const [tagIds, setTagIds] = useState<number[]>(
    (event?.tags ?? []).map((tag) => tag.id),
  );
  const set = (change: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...change }));
  // She has unsaved edits when the form differs from the server's copy (ids in any order).
  const unsaved =
    JSON.stringify(form) !== JSON.stringify(base.current) ||
    JSON.stringify([...filterOptionIds].sort()) !==
      ids(event?.filter_options) ||
    JSON.stringify([...tagIds].sort()) !== ids(event?.tags);

  // Focus mode: the copy run's title and description type in; only the field
  // being written is read-only, and a written value lands unless she changed it.
  const live = useLiveRecord(focus?.record ?? "", focus?.runId ?? null);
  const taken = useRef<Record<string, string>>({});
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    taken.current = {};
  }, [focus?.runId]);
  useEffect(() => {
    if (!live) return;
    for (const name of ["title", "description"] as const) {
      const field = live.fields[name];
      if (!field || field.typing || taken.current[name] === field.value)
        continue;
      taken.current[name] = field.value;
      const was = base.current[name];
      base.current = { ...base.current, [name]: field.value };
      setForm((mine) =>
        mine[name] === was ? { ...mine, [name]: field.value } : mine,
      );
    }
    // Once it has all been shown, the saved event takes over: a run replayed
    // at once on a later visit never stands in for what she saved since.
    const run = focus?.runId;
    if (live.settled && run && loadedFor.current !== run) {
      loadedFor.current = run;
      focus?.reload();
    }
  }, [live, focus]);
  // What a save sends: a field the run wrote counts as written even while it
  // is still typing in (the server has it; the old value would undo it),
  // unless she changed that field herself.
  const landed = (name: "title" | "description") => {
    const written = live?.written[name];
    return written !== undefined &&
      taken.current[name] !== written &&
      form[name] === base.current[name]
      ? written
      : form[name];
  };
  const writing = (name: "title" | "description") =>
    live?.fields[name]?.typing ?? false;
  const shown = (name: "title" | "description") =>
    writing(name) ? (live?.fields[name]?.value ?? "") : form[name];
  const creation = useActiveCreation();
  // The cover step: the Designer's drafts take the cover's place.
  const atCover =
    !!focus &&
    !!creation &&
    (creation.question
      ? creation.question.field === "cover"
      : creation.steps.find((step) => !step.done)?.id === "cover");
  const [allDetails, setAllDetails] = useState(false);
  const detailsShown = !focus || allDetails;

  const config = EVENT_KINDS[kind];
  const has = (field: (typeof config.fields)[number]) =>
    config.fields.includes(field);
  // "Members only" is not a choice everywhere: fall back when the kind changes.
  const pricingType =
    form.pricing_type === "subscription" && !config.membersOnly
      ? "free"
      : form.pricing_type;

  // Held: a draft with a date (sell later, focus mode). Saving keeps it a draft;
  // Publish saves and puts every upcoming session of its series on the schedule.
  const held = event?.status === "draft" && !!event.scheduled_at;
  const ahead = !!form.scheduled_at && new Date(form.scheduled_at) > new Date();
  const invalid = !form.title.trim() || (pricingType === "paid" && !form.price);

  const submit = async (publish: boolean) => {
    const body = {
      title: landed("title").trim(),
      description: landed("description"),
      // null clears the date: the event is a draft again.
      scheduled_at: form.scheduled_at
        ? new Date(form.scheduled_at).toISOString()
        : null,
      pricing_type: pricingType,
      price: pricingType === "paid" ? form.price || "0" : "0",
      filter_option_ids: filterOptionIds,
      tag_ids: tagIds,
      ...(has("auto_recording") && { auto_recording: form.auto_recording }),
      ...(has("zoom_link") && { zoom_link: form.zoom_link.trim() }),
      ...(has("location") && { location: form.location.trim() }),
      ...(has("address") && { address: form.address }),
      ...(has("max_capacity") && {
        max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
      }),
    };
    const saved = await clientFetch<EventRow>(
      event ? `${config.api}${event.id}/` : config.api,
      {
        method: event ? "PUT" : "POST",
        body: JSON.stringify(
          publish ? { ...body, publish_series: true } : body,
        ),
      },
    );
    // Publish is the server's call: its date may have passed, so it stays a draft.
    if (publish && saved.status !== "scheduled") {
      const past =
        !saved.scheduled_at || new Date(saved.scheduled_at) <= new Date();
      toast.error(t(past ? "heldPast" : "notPublished"));
      return;
    }
    if (!event) onCreated?.(saved.id, kind);
    toast.success(t(publish ? "published" : event ? "saved" : "created"));
    onSaved();
  };
  const onError = (err: unknown) =>
    toast.error(serverMessage(err) ?? t("saveError"));
  const { run: save, loading: saving } = useAsyncAction(() => submit(false), {
    onError,
  });
  const { run: publish, loading: publishing } = useAsyncAction(
    () => submit(true),
    { onError },
  );
  // Focus mode: "Save & leave" saves what she typed on the page first.
  const saveRef = useRef(() => submit(false));
  saveRef.current = () => submit(false);
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;
  const focusing = !!focus;
  useEffect(() => {
    if (!focusing) return;
    setFocusSave(() =>
      unsavedRef.current ? saveRef.current() : Promise.resolve(),
    );
    return () => setFocusSave(null);
  }, [focusing]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {event ? t("editing", { title: event.title }) : t("new")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Not a <form>: the tag and filter pickers inside take Enter for
            themselves, and a form would submit on it. */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-kind">{t("where")}</Label>
            <select
              id="event-kind"
              value={kind}
              disabled={!!event}
              onChange={(e) => setKind(e.target.value as EventKind)}
              className={selectClasses}
            >
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}.label`)}
                </option>
              ))}
            </select>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t(`kinds.${kind}.hint`)}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="event-title">{t("title")}</Label>
              {writing("title") && live?.working && (
                <WorkingTag
                  specialist={live.working.specialist}
                  label={tf("writing")}
                />
              )}
            </div>
            <Input
              id="event-title"
              value={shown("title")}
              readOnly={writing("title")}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={t(`kinds.${kind}.titlePlaceholder`)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="event-description">{t("description")}</Label>
              {writing("description") && live?.working && (
                <WorkingTag
                  specialist={live.working.specialist}
                  label={tf("writing")}
                />
              )}
            </div>
            <Textarea
              id="event-description"
              value={shown("description")}
              readOnly={writing("description")}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
            />
          </div>

          {/* The series is every session of this kind with this title as last saved, so the door
              uses the saved title, not an edit still in the field above. */}
          {event && atCover && creation ? (
            <CoverStep
              creationId={creation.id}
              cover={creation.cover}
              item={listedItem(
                { title: event.title, scheduled_at: event.scheduled_at },
                timeZone,
              )}
            />
          ) : (
            event && (
              <div className="space-y-2">
                <Label>{t("cover")}</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <CoverThumb
                    design={event.cover_design}
                    photoUrl={event.thumbnail_signed_url}
                    item={listedItem(
                      { title: event.title, scheduled_at: event.scheduled_at },
                      timeZone,
                    )}
                    className="w-48"
                  />
                  <OpenStudioButton
                    target={{
                      target_kind: event.kind,
                      target_key: event.title,
                    }}
                    from={event.cover_design?.id}
                    unsaved={unsaved}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("coverHint", { title: event.title })}
                </p>
              </div>
            )
          )}

          <div className="space-y-2">
            <Label htmlFor="event-when">{t("when")}</Label>
            <Input
              id="event-when"
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => set({ scheduled_at: e.target.value })}
              className="sm:max-w-xs"
            />
            {focus?.schedule ? (
              <p className="text-sm text-foreground">
                {focus.schedule}
                {/* Her schedule is read on her site's clock (G13). */}
                <span className="block text-xs text-muted-foreground">
                  {t("timesIn", { zone: timeZone.replaceAll("_", " ") })}
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("whenHint")}</p>
            )}
          </div>

          {has("zoom_link") && (
            <div className="space-y-2">
              <Label htmlFor="event-zoom">{t("zoomLink")}</Label>
              <Input
                id="event-zoom"
                type="url"
                value={form.zoom_link}
                onChange={(e) => set({ zoom_link: e.target.value })}
                placeholder="https://zoom.us/j/..."
              />
            </div>
          )}

          {has("location") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-location">{t("location")}</Label>
                <Input
                  id="event-location"
                  value={form.location}
                  onChange={(e) => set({ location: e.target.value })}
                  placeholder={t("locationPlaceholder")}
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-address">{t("address")}</Label>
                <Input
                  id="event-address"
                  value={form.address}
                  onChange={(e) => set({ address: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="event-access">{t("access")}</Label>
              <select
                id="event-access"
                value={pricingType}
                onChange={(e) => set({ pricing_type: e.target.value })}
                className={selectClasses}
              >
                <option value="free">{t("free")}</option>
                <option value="paid">{t("paid")}</option>
                {config.membersOnly && (
                  <option value="subscription">{t("membersOnly")}</option>
                )}
              </select>
            </div>
            {pricingType === "paid" && (
              <div className="space-y-2">
                <Label htmlFor="event-price">{t("price", { currency })}</Label>
                <Input
                  id="event-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => set({ price: e.target.value })}
                />
              </div>
            )}
            {has("max_capacity") && detailsShown && (
              <div className="space-y-2">
                <Label htmlFor="event-capacity">{t("capacity")}</Label>
                <Input
                  id="event-capacity"
                  type="number"
                  min="1"
                  step="1"
                  value={form.max_capacity}
                  onChange={(e) => set({ max_capacity: e.target.value })}
                  placeholder={t("capacityPlaceholder")}
                />
              </div>
            )}
          </div>

          {focus && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 gap-1.5"
              aria-expanded={allDetails}
              onClick={() => setAllDetails((open) => !open)}
            >
              {allDetails ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {tf("allDetails")}
            </Button>
          )}

          {has("auto_recording") && detailsShown && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.auto_recording}
                onChange={(e) => set({ auto_recording: e.target.checked })}
              />
              {t("record")}
            </label>
          )}

          {detailsShown && (
            <>
              <div className="space-y-2">
                <Label>{t("filters")}</Label>
                <FilterPicker
                  scope="event"
                  value={filterOptionIds}
                  onChange={setFilterOptionIds}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("tags")}</Label>
                <TagInput scope="event" value={tagIds} onChange={setTagIds} />
              </div>
            </>
          )}

          {/* Focus mode's last step publishes it: not this form, while she is in it. */}
          {held && !focus && (
            <p className="text-sm text-muted-foreground">{t("held")}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={save}
              loading={saving}
              loadingText={t("saving")}
              disabled={invalid || publishing}
            >
              {t(event ? "save" : "create")}
            </Button>
            {held && !focus && (
              <Button
                variant="secondary"
                onClick={publish}
                loading={publishing}
                loadingText={t("publishing")}
                disabled={invalid || !ahead || saving}
              >
                {t("publish")}
              </Button>
            )}
            {!focus && (
              <Button variant="outline" onClick={onCancel}>
                {t("cancel")}
              </Button>
            )}
            {held && !ahead && !focus && (
              <span className="text-xs text-muted-foreground">
                {t("heldPast")}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
