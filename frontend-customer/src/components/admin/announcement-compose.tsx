"use client";

import { useEffect, useState } from "react";

import {
  AlertTriangle,
  FileText,
  Globe,
  Link2,
  Loader2,
  Mail,
  Megaphone,
  Search,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { LinkPickerModal } from "@/components/owner/link-picker";
import { useRichEditor } from "@/components/owner/rich-editor";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  AnnouncementFilters,
  AnnouncementTemplate,
  Frequency,
  createAnnouncement,
  createRecurring,
  listTemplates,
  previewAudience,
  saveTemplate,
} from "@/lib/announcements";

const PLATFORMS: ("ios" | "android" | "desktop")[] = [
  "ios",
  "android",
  "desktop",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AnnouncementCompose({
  onSent,
}: {
  onSent: () => void;
}) {
  const editor = useRichEditor();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [filters, setFilters] = useState<AnnouncementFilters>({});
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [reach, setReach] = useState<{
    audience: number;
    push_reachable: number;
  } | null>(null);
  const [sending, setSending] = useState(false);

  // Scheduling
  const [mode, setMode] = useState<"once" | "repeating">("once");
  const [scheduledAt, setScheduledAt] = useState("");
  const [freq, setFreq] = useState<Frequency>("daily");
  const [weekday, setWeekday] = useState<number | null>(null);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [sendTime, setSendTime] = useState("09:00");
  const [startDate, setStartDate] = useState("");
  const [endsOnDate, setEndsOnDate] = useState(false);
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    previewAudience(filters)
      .then((r) => !cancelled && setReach(r))
      .catch(() => !cancelled && setReach(null));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const togglePlatform = (p: "ios" | "android" | "desktop") =>
    setFilters((f) => {
      const set = new Set(f.platform ?? []);
      set.has(p) ? set.delete(p) : set.add(p);
      return { ...f, platform: set.size ? Array.from(set) : undefined };
    });

  const applyTemplate = (t: AnnouncementTemplate) => {
    setTitle(t.title);
    setBody(t.body);
    setLink(t.link || "");
    setLinkLabel(t.link_label || "");
    setTemplateOpen(false);
  };

  const reset = () => {
    setTitle("");
    setBody("");
    setLink("");
    setLinkLabel("");
    setFilters({});
    setAlsoEmail(false);
    setMode("once");
    setScheduledAt("");
    setWeekday(null);
    setStartDate("");
    setEndsOnDate(false);
    setEndDate("");
  };

  const saveAsTemplate = async () => {
    if (!title.trim()) return;
    const name = window.prompt("Name this template:", title.trim());
    if (!name) return;
    try {
      await saveTemplate({
        name,
        title: title.trim(),
        body,
        link: link.trim() || "",
        link_label: linkLabel,
      });
      toast.success("Template saved");
    } catch {
      toast.error("Could not save template");
    }
  };

  const send = async () => {
    if (!title.trim()) return;
    if (mode === "repeating" && !startDate) {
      toast.error("Pick a start date");
      return;
    }
    if (mode === "repeating" && freq === "weekly" && weekday === null) {
      toast.error("Pick a day of the week");
      return;
    }
    setSending(true);
    try {
      if (mode === "repeating") {
        await createRecurring({
          title: title.trim(),
          body,
          link: link.trim() || "",
          link_label: linkLabel,
          filters,
          also_email: alsoEmail,
          frequency: freq,
          send_time: sendTime,
          weekday: freq === "weekly" ? weekday : null,
          day_of_month: freq === "monthly" ? dayOfMonth : null,
          start_date: startDate,
          end_date: endsOnDate && endDate ? endDate : null,
        });
        toast.success("Recurring announcement created");
      } else {
        await createAnnouncement({
          title: title.trim(),
          body,
          link: link.trim() || undefined,
          filters,
          also_email: alsoEmail,
          scheduled_at: scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null,
        });
        toast.success(
          scheduledAt ? "Announcement scheduled" : "Announcement sent",
        );
      }
      reset();
      onSent();
    } catch {
      toast.error("Failed to send announcement");
    } finally {
      setSending(false);
    }
  };

  const sendLabel =
    mode === "repeating"
      ? "Create recurring"
      : scheduledAt
        ? "Schedule"
        : "Send now";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setTemplateOpen(true)}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <FileText className="h-4 w-4" /> Start from a template
        </button>
        {title.trim() && (
          <button
            type="button"
            onClick={saveAsTemplate}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Save as template
          </button>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
      />

      <button
        type="button"
        onClick={() =>
          editor?.openRichEditor({
            value: body,
            title: "Announcement body",
            onSave: setBody,
          })
        }
        className="w-full rounded-lg border border-dashed border-border bg-background p-3 text-left text-sm text-muted-foreground"
      >
        {body ? (
          <span dangerouslySetInnerHTML={{ __html: body }} />
        ) : (
          "Write announcement body…"
        )}
      </button>

      {link ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{linkLabel || link}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setLinkPickerOpen(true)}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Change
            </button>
            <button
              type="button"
              aria-label="Remove link"
              onClick={() => {
                setLink("");
                setLinkLabel("");
              }}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLinkPickerOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-background p-3 text-left text-sm text-muted-foreground hover:border-primary hover:text-foreground"
        >
          <Link2 className="h-4 w-4 shrink-0" />
          Add a link (optional) — where tapping the announcement takes them
        </button>
      )}

      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <div className="font-medium">Audience filters</div>
        <div className="flex flex-wrap gap-2">
          {(["pwa", "browser"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  app_type: f.app_type === t ? undefined : t,
                }))
              }
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${filters.app_type === t ? "bg-primary text-primary-foreground" : "border-border"}`}
            >
              {t === "pwa" ? (
                <Smartphone className="h-3.5 w-3.5" />
              ) : (
                <Globe className="h-3.5 w-3.5" />
              )}
              {t === "pwa" ? "PWA" : "Browser"}
            </button>
          ))}
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`rounded-full border px-3 py-1 ${filters.platform?.includes(p) ? "bg-primary text-primary-foreground" : "border-border"}`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setFilters((f) => ({
                ...f,
                push_enabled: f.push_enabled ? undefined : true,
              }))
            }
            className={`rounded-full border px-3 py-1 ${filters.push_enabled ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            Push-enabled only
          </button>
        </div>
        {reach === null ? (
          <div className="text-muted-foreground">
            Calculating who will receive this…
          </div>
        ) : reach.audience === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No students match these filters — nobody will receive this
              announcement.
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-background p-2.5">
            <Megaphone className="mr-1 inline h-4 w-4 align-[-3px]" />
            Goes to{" "}
            <strong className="text-foreground">{reach.audience}</strong>{" "}
            student
            {reach.audience === 1 ? "" : "s"} in their feed
            {reach.push_reachable > 0 ? (
              <>
                {" "}
                ·{" "}
                <strong className="text-foreground">
                  {reach.push_reachable}
                </strong>{" "}
                also get a phone notification
              </>
            ) : (
              <> · none have phone notifications turned on yet</>
            )}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={alsoEmail}
          onChange={(e) => setAlsoEmail(e.target.checked)}
        />
        <Mail className="h-4 w-4 text-muted-foreground" />
        Also send as an email (uses your brand)
      </label>

      {/* Once / Repeating */}
      <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["once", "repeating"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 capitalize ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {m === "once" ? "One time" : "Repeating"}
            </button>
          ))}
        </div>

        {mode === "once" ? (
          <label className="block">
            Schedule (optional)
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="ml-2 rounded-lg border border-border bg-background p-1"
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["daily", "weekly", "monthly"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFreq(f)}
                  className={`rounded-full border px-3 py-1 capitalize ${freq === f ? "bg-primary text-primary-foreground" : "border-border"}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {freq === "weekly" && (
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setWeekday(i)}
                    className={`rounded-md border px-2 py-1 text-xs ${weekday === i ? "bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            {freq === "monthly" && (
              <label className="block">
                Day of month
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) =>
                    setDayOfMonth(
                      Math.min(31, Math.max(1, Number(e.target.value))),
                    )
                  }
                  className="ml-2 w-16 rounded-lg border border-border bg-background p-1"
                />
              </label>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <label>
                Time
                <input
                  type="time"
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                  className="ml-2 rounded-lg border border-border bg-background p-1"
                />
              </label>
              <label>
                Starts
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="ml-2 rounded-lg border border-border bg-background p-1"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span>Ends:</span>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={!endsOnDate}
                  onChange={() => setEndsOnDate(false)}
                />{" "}
                Never
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={endsOnDate}
                  onChange={() => setEndsOnDate(true)}
                />{" "}
                On date
              </label>
              {endsOnDate && (
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-border bg-background p-1"
                />
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Times are in your account timezone.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={send}
        disabled={sending || !title.trim()}
        className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {sendLabel}
      </button>

      {linkPickerOpen && (
        <LinkPickerModal
          initialValue={link}
          onPick={(href, label) => {
            setLink(href);
            setLinkLabel(label ?? href);
            setLinkPickerOpen(false);
          }}
          onClose={() => setLinkPickerOpen(false)}
        />
      )}

      {templateOpen && (
        <TemplatePickerModal
          onPick={applyTemplate}
          onClose={() => setTemplateOpen(false)}
        />
      )}
    </div>
  );
}

function TemplatePickerModal({
  onPick,
  onClose,
}: {
  onPick: (t: AnnouncementTemplate) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AnnouncementTemplate[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((r) => !cancelled && setItems(r))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = items?.filter(
    (t) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q),
  );

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Choose a template</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates…"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {items === null ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered && filtered.length > 0 ? (
              <div className="space-y-1">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onPick(t)}
                    className="flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {t.name}
                      {t.builtin && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          built-in
                        </span>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t.title}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No templates yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
