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
import {
  AccessSection,
  type AccessProblem,
} from "@/components/admin/access/access-section";
import { useTenant } from "@/hooks/use-tenant";
import { clientFetch } from "@/lib/api-client";
import { uploadWhiteboard } from "@/lib/upload";
import { useLiveRecord } from "@/lib/copilot/live";
import { listedItem } from "@/lib/covers/items";
import { EVENT_TIDY, eventOwn } from "@/lib/focus/own-fields";
import { setFocusSave, useActiveCreation } from "@/lib/focus/store";
import { useAccess } from "@/lib/access/use-access";
import { ApiError } from "@/types/api";
import { useAsyncAction } from "@shared/hooks/use-async-action";

import { toLocalDatetimeValue } from "./shared";
import {
  EVENT_KINDS,
  KIND_ORDER,
  type EventKind,
  type EventRow,
} from "./kinds";

/** The kind's name in the access endpoint. */
const ACCESS_KIND: Record<EventKind, string> = {
  live: "live_class",
  stream: "live_stream",
  zoom: "zoom_class",
  onsite: "onsite_event",
};

/** The creator's sentence from a refused access save, or "". */
const accessSentence = (err: unknown) =>
  err instanceof ApiError && typeof err.data.detail === "string"
    ? err.data.detail
    : "";

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
  auto_recording: event?.auto_recording ?? false,
  watermark: event?.watermark ?? false,
  whiteboard_key: event?.whiteboard_key ?? "",
  zoom_link: event?.zoom_link ?? "",
  location: event?.location ?? "",
  address: event?.address ?? "",
  max_capacity: event?.max_capacity ? String(event.max_capacity) : "",
});
type Fields = ReturnType<typeof fieldsOf>;
/** The two fields she and the copy run both write (focus mode). */
const OWN = ["title", "description"] as const;
type OwnName = (typeof OWN)[number];
type Own = Record<OwnName, string>;
const ownOf = (fields: Fields): Own => ({
  title: fields.title,
  description: fields.description,
});
const { isHers, isWriting, layOver } = eventOwn;
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
  const timeZone = useTenant()?.timezone || "UTC";
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "live");
  const [form, setForm] = useState(() => fieldsOf(event));
  // The fields as the server last had them. A newer copy of the event (focus
  // mode's answers write it) takes every field she has not changed.
  const base = useRef<Fields>(form);
  // The title and description are also written by the copy run, so each
  // remembers the copy it was last GIVEN (`placed`); one that differs from the
  // form (`mine`) is hers, saved or not, and no copy ever replaces it.
  const placed = useRef<Own>(ownOf(form));
  const mine = useRef<Own>(ownOf(form));
  mine.current = ownOf(form);
  const lay = (next: Own) => {
    const laid = layOver(mine.current, placed.current, next);
    placed.current = laid.placed;
    const changed: Partial<Own> = {};
    for (const name of OWN)
      if (laid.form[name] !== mine.current[name])
        changed[name] = laid.form[name];
    if (Object.keys(changed).length)
      setForm((current) => ({ ...current, ...changed }));
  };
  useEffect(() => {
    const next = fieldsOf(event);
    const was = base.current;
    base.current = next;
    lay(ownOf(next));
    setForm((now) => {
      const merged: Record<string, unknown> = { ...now };
      for (const key of Object.keys(next) as (keyof Fields)[])
        if (!(OWN as readonly string[]).includes(key) && now[key] === was[key])
          merged[key] = next[key];
      return merged as Fields;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lay` only reads refs
  }, [event]);
  const [filterOptionIds, setFilterOptionIds] = useState<number[]>(
    (event?.filter_options ?? []).map((o) => o.id),
  );
  const [tagIds, setTagIds] = useState<number[]>(
    (event?.tags ?? []).map((tag) => tag.id),
  );
  const set = (change: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...change }));
  // How people get it: the Access section's ways, saved with the event. The
  // kind is fixed once the event exists; before that the choices follow it.
  const access = useAccess(ACCESS_KIND[kind], event?.id ?? null);
  const [accessProblems, setAccessProblems] = useState<AccessProblem[]>([]);
  const accessDirty =
    !!access.ways &&
    !!access.payload &&
    JSON.stringify(access.ways) !== JSON.stringify(access.payload.ways);
  // She has unsaved edits when the form differs from the server's copy (ids in any order).
  const unsaved =
    accessDirty ||
    JSON.stringify(form) !== JSON.stringify(base.current) ||
    JSON.stringify([...filterOptionIds].sort()) !==
      ids(event?.filter_options) ||
    JSON.stringify([...tagIds].sort()) !== ids(event?.tags);

  // Focus mode: the copy run's title and description type in; only the field
  // being written is read-only, and a written value lands unless the field is
  // hers (changed since it was last given, saved or not).
  const live = useLiveRecord(focus?.record ?? "", focus?.runId ?? null);
  const taken = useRef<Record<string, string>>({});
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    taken.current = {};
  }, [focus?.runId]);
  useEffect(() => {
    if (!live) return;
    for (const name of OWN) {
      const field = live.fields[name];
      if (!field || field.typing || taken.current[name] === field.value)
        continue;
      taken.current[name] = field.value;
      if (isHers(name, mine.current[name], placed.current[name])) continue;
      const value = EVENT_TIDY[name](field.value);
      base.current = { ...base.current, [name]: value };
      lay({ ...placed.current, [name]: value });
    }
    // Once it has all been shown, the saved event takes over: a run replayed
    // at once on a later visit never stands in for what she saved since.
    const run = focus?.runId;
    if (live.settled && run && loadedFor.current !== run) {
      loadedFor.current = run;
      focus?.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lay` only reads refs
  }, [live, focus]);
  // What a save sends: a field the run wrote counts as written even while it
  // is still typing in (the server has it; the old value would undo it),
  // unless that field is hers.
  const landed = (name: OwnName) => {
    const written = live?.written[name];
    return written !== undefined &&
      taken.current[name] !== written &&
      !isHers(name, mine.current[name], placed.current[name])
      ? written
      : form[name];
  };
  // Read-only while the run types it in, and only if it is not hers.
  const writing = (name: OwnName) =>
    isWriting(
      name,
      live?.fields[name]?.typing ?? false,
      mine.current[name],
      placed.current[name],
    );
  const shown = (name: OwnName) =>
    writing(name) ? (live?.fields[name]?.value ?? "") : form[name];
  const creation = useActiveCreation();
  // Focus mode's access step writes the event's ways on the server: the section
  // takes them in, so a later tick never saves from the old ways (as the course
  // form). Ways she changed herself and has not saved stay hers.
  const accessDirtyRef = useRef(accessDirty);
  accessDirtyRef.current = accessDirty;
  const reloadAccess = access.reload;
  const accessAnswered = creation?.answered
    .filter((line) => line.field === "access")
    .map((line) => line.label)
    .join("|");
  useEffect(() => {
    if (!focus || !accessAnswered) return;
    if (!accessDirtyRef.current) void reloadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per settled answer
  }, [accessAnswered, reloadAccess]);
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
  const [boardUploading, setBoardUploading] = useState(false);
  const attachBoard = async (file: File) => {
    setBoardUploading(true);
    try {
      set({ whiteboard_key: await uploadWhiteboard(file) });
    } catch {
      toast.error(t("whiteboardFailed"));
    } finally {
      setBoardUploading(false);
    }
  };

  const has = (field: (typeof config.fields)[number]) =>
    config.fields.includes(field);
  // Held: a draft with a date (sell later, focus mode). Saving keeps it a draft;
  // Publish saves and puts every upcoming session of its series on the schedule.
  const held = event?.status === "draft" && !!event.scheduled_at;
  const ahead = !!form.scheduled_at && new Date(form.scheduled_at) > new Date();
  const invalid = !form.title.trim();

  const submit = async (publish: boolean) => {
    if (accessProblems.length) {
      toast.error(accessProblems[0].text);
      return;
    }
    const body = {
      title: landed("title").trim(),
      description: landed("description"),
      // null clears the date: the event is a draft again.
      scheduled_at: form.scheduled_at
        ? new Date(form.scheduled_at).toISOString()
        : null,
      filter_option_ids: filterOptionIds,
      tag_ids: tagIds,
      ...(has("auto_recording") && { auto_recording: form.auto_recording }),
      ...(has("watermark") && { watermark: form.watermark }),
      ...(has("whiteboard_key") && { whiteboard_key: form.whiteboard_key }),
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
    // The event exists now: a refused access setting must not make a retry
    // create it twice, so say so and let her fix it on the event's page.
    // Untouched ways are the new event's default: nothing to save.
    if (accessDirty) {
      try {
        await access.save(saved.id);
      } catch (err) {
        toast.error(`${t("accessNotSaved")} ${accessSentence(err)}`);
        // Created: leaving create mode keeps a retry from creating it twice.
        if (!event) {
          onCreated?.(saved.id, kind);
          onSaved();
        }
        return;
      }
    }
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

          <AccessSection
            kind={ACCESS_KIND[kind]}
            value={access.ways}
            onChange={access.setWays}
            payload={access.payload}
            onProblems={setAccessProblems}
          />
          {access.error && (
            <p role="alert" className="text-xs text-destructive">
              {access.error}
            </p>
          )}

          {has("max_capacity") && detailsShown && (
            <div className="space-y-2 sm:max-w-xs">
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

          {has("watermark") && detailsShown && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.watermark}
                  onChange={(e) => set({ watermark: e.target.checked })}
                  aria-describedby="event-watermark-hint"
                />
                {t("watermark")}
              </label>
              <p
                id="event-watermark-hint"
                className="text-xs text-muted-foreground"
              >
                {t("watermarkHint")}
              </p>
            </div>
          )}

          {has("whiteboard_key") && detailsShown && (
            <div className="space-y-1">
              <Label>{t("whiteboard")}</Label>
              {form.whiteboard_key ? (
                <div className="flex items-center gap-3 text-sm">
                  <span>{t("whiteboardAttached")}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set({ whiteboard_key: "" })}
                  >
                    {t("whiteboardRemove")}
                  </Button>
                </div>
              ) : (
                <input
                  type="file"
                  accept=".excalidraw,application/json"
                  className="block text-sm"
                  disabled={boardUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void attachBoard(file);
                  }}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {t("whiteboardHint")}
              </p>
            </div>
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
