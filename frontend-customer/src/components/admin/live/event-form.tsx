"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { FilterPicker } from "@/components/admin/filter-picker";
import { TagInput } from "@/components/admin/tag-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clientFetch } from "@/lib/api-client";
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

/** The one form for a class or event, new or existing. "Where it happens"
 *  picks the kind and shows that kind's own fields; it is fixed once the
 *  event exists, because each kind lives in its own table. */
export function EventForm({
  event,
  onSaved,
  onCancel,
}: {
  /** Omitted: a new event. */
  event?: EventRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.events");
  const currency = useTenantCurrency();
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "live");
  const [form, setForm] = useState({
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
  const [filterOptionIds, setFilterOptionIds] = useState<number[]>(
    (event?.filter_options ?? []).map((o) => o.id),
  );
  const [tagIds, setTagIds] = useState<number[]>(
    (event?.tags ?? []).map((tag) => tag.id),
  );
  const set = (change: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...change }));

  const config = EVENT_KINDS[kind];
  const has = (field: (typeof config.fields)[number]) =>
    config.fields.includes(field);
  // "Members only" is not a choice everywhere: fall back when the kind changes.
  const pricingType =
    form.pricing_type === "subscription" && !config.membersOnly
      ? "free"
      : form.pricing_type;

  const { run: save, loading: saving } = useAsyncAction(
    async () => {
      const body = {
        title: form.title.trim(),
        description: form.description,
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
      await clientFetch(event ? `${config.api}${event.id}/` : config.api, {
        method: event ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      toast.success(t(event ? "saved" : "created"));
      onSaved();
    },
    { onError: (err) => toast.error(serverMessage(err) ?? t("saveError")) },
  );

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
            <Label htmlFor="event-title">{t("title")}</Label>
            <Input
              id="event-title"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={t(`kinds.${kind}.titlePlaceholder`)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-description">{t("description")}</Label>
            <Textarea
              id="event-description"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-when">{t("when")}</Label>
            <Input
              id="event-when"
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => set({ scheduled_at: e.target.value })}
              className="sm:max-w-xs"
            />
            <p className="text-xs text-muted-foreground">{t("whenHint")}</p>
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
            {has("max_capacity") && (
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

          {has("auto_recording") && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.auto_recording}
                onChange={(e) => set({ auto_recording: e.target.checked })}
              />
              {t("record")}
            </label>
          )}

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

          <div className="flex gap-2">
            <Button
              onClick={save}
              loading={saving}
              loadingText={t("saving")}
              disabled={
                !form.title.trim() || (pricingType === "paid" && !form.price)
              }
            >
              {t(event ? "save" : "create")}
            </Button>
            <Button variant="outline" onClick={onCancel}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
