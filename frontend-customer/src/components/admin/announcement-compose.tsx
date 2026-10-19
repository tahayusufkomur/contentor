"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  AlertTriangle,
  FileText,
  Globe,
  Link2,
  Mail,
  Megaphone,
  Search,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { WorkingTag } from "@/components/focus/working-tag";
import { LinkPickerModal } from "@/components/owner/link-picker";
import { useRichEditor } from "@/components/owner/rich-editor";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useLiveRecord } from "@/lib/copilot/live";
import { setFocusSave } from "@/lib/focus/store";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import {
  AnnouncementFilters,
  AnnouncementTemplate,
  ComposePrefill,
  DraftFields,
  Frequency,
  createAnnouncement,
  createRecurring,
  deleteAnnouncement,
  draftFields,
  getAnnouncement,
  isHers,
  isWriting,
  layOver,
  listTemplates,
  previewAudience,
  saveDraftChanges,
  saveTemplate,
  tidyField,
} from "@/lib/announcements";

const PLATFORMS: ("ios" | "android" | "desktop")[] = [
  "ios",
  "android",
  "desktop",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Focus mode saves a moment after she stops typing. */
const SAVE_AFTER_MS = 800;

export default function AnnouncementCompose({
  onSent,
  reviewDraft: reviewDraftProp,
  onDraftReviewed,
  focus,
}: {
  onSent: () => void;
  /** A draft the coach picked "Review & send" on — prefills the form as a
   * one-off template. The draft row itself is never edited: on successful
   * send/schedule below, it's deleted (see draftId branch in `send`), never
   * PATCHed or status-transitioned. */
  reviewDraft?: { id: number; prefill: ComposePrefill } | null;
  onDraftReviewed?: () => void;
  /** Focus mode: the composer works on ONE draft row in place (``record`` is
   *  its id). It loads that draft, saves what she changes as she types, and
   *  shows the copy run (``runId``) writing the title and body live; a field
   *  she has changed is never replaced. Nothing here sends, schedules or
   *  narrows the audience: the guide's finish step does. ``reload`` is told
   *  when the run has settled and the draft was loaded again. */
  focus?: { record: number; runId: number | null; reload?: () => void };
}) {
  // Focus mode edits the row itself; the review path (a copy that is sent as
  // a new message, the draft deleted) belongs to the plain composer.
  const reviewDraft = focus ? null : reviewDraftProp;
  const tr = useTranslations("admin.messages.compose");
  const tf = useTranslations("admin.focus");
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

  const focusId = focus?.record;
  useEffect(() => {
    if (focusId) return; // the audience is the guide's question
    let cancelled = false;
    previewAudience(filters)
      .then((r) => !cancelled && setReach(r))
      .catch(() => !cancelled && setReach(null));
    return () => {
      cancelled = true;
    };
  }, [filters, focusId]);

  // The draft focus mode had open here: once focus mode ends, the form
  // already holds it as she left it, so it is not prefilled over again.
  const held = useRef<number | null>(null);
  if (focus) held.current = focus.record;

  // "Review & send" a draft: seed the form as a one-off template, keyed on
  // the draft id so switching to a different draft re-prefills.
  useEffect(() => {
    if (!reviewDraft) return;
    // Who, when and by email as the draft holds them: a focus Keep wrote them.
    setFilters(reviewDraft.prefill.filters);
    setAlsoEmail(reviewDraft.prefill.alsoEmail);
    setMode("once");
    setScheduledAt(reviewDraft.prefill.scheduledAt);
    if (reviewDraft.id === held.current) return; // her text is already here
    setTitle(reviewDraft.prefill.title);
    setBody(reviewDraft.prefill.body);
    setLink(reviewDraft.prefill.link);
    setLinkLabel(reviewDraft.prefill.link);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the draft id, not the whole object
  }, [reviewDraft?.id]);

  // ── Focus mode: she and the copy run both write one draft row ─────────────
  // `base` is the draft as the server last had it, `placed` the copy each
  // field of the form was last given (a field that differs is hers), `mine`
  // the form now. A save sends only what differs from `base`, and a newer copy
  // replaces only the fields she has not changed: whichever of the two writes
  // last, neither undoes the other.
  const base = useRef<DraftFields>({ title: "", body: "", link: "" });
  const placed = useRef<DraftFields>({ title: "", body: "", link: "" });
  const mine = useRef<DraftFields>({ title, body, link });
  mine.current = { title, body, link };
  const lay = (next: DraftFields) => {
    const now = mine.current;
    const laid = layOver(now, placed.current, next);
    placed.current = laid.placed;
    if (laid.form.title !== now.title) setTitle(laid.form.title);
    if (laid.form.body !== now.body) setBody(laid.form.body);
    if (laid.form.link !== now.link) {
      setLink(laid.form.link);
      setLinkLabel("");
    }
  };
  const loadDraft = (settled = false) =>
    focusId
      ? getAnnouncement(focusId)
          .then((draft) => {
            base.current = draftFields(draft);
            lay(base.current);
            if (settled) focus?.reload?.();
          })
          .catch(() => toast.error(tr("loadError"), { id: "message-load" }))
      : Promise.resolve();
  // Saves go one at a time, each sending what she has changed by then.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const save = () => {
    const run = saving.current.then(async () => {
      if (!focusId) return;
      const sent = await saveDraftChanges(focusId, mine.current, base.current);
      base.current = { ...base.current, ...sent }; // not the copy a reload may have replaced
    });
    saving.current = run.catch(() => {});
    return run;
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  const saveQuietly = () =>
    saveRef
      .current()
      .catch(() => toast.error(tr("saveError"), { id: "message-save" }));

  // The draft as it is now (and again once the run has written it, below).
  useEffect(() => {
    void loadDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the draft
  }, [focusId]);
  // She stops typing: save. She leaves the page: save what is still waiting.
  useEffect(() => {
    if (!focusId) return;
    const timer = setTimeout(() => void saveQuietly(), SAVE_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `saveQuietly` only reads refs
  }, [title, body, link, focusId]);
  useEffect(() => {
    if (!focusId) return;
    setFocusSave(() => saveRef.current()); // "Save & leave" waits for it
    const flush = saveRef.current; // this draft's, even if the page moves on
    // Closing the tab: the request has to outlive the page, so it is sent at
    // once and does not wait for a save in flight.
    const closing = () =>
      void saveDraftChanges(focusId, mine.current, base.current, {
        keepalive: true,
      }).catch(() => {});
    window.addEventListener("pagehide", closing);
    return () => {
      window.removeEventListener("pagehide", closing);
      setFocusSave(null);
      // Leaving the page: nobody is left to read a failure, so it is silent.
      void flush().catch(() => {});
    };
  }, [focusId]);

  // The run's title and body type in; the field being written is read-only.
  // What it wrote is on the server already, so a field of hers is left alone
  // (her save, or the next, puts hers there).
  const live = useLiveRecord(
    focusId ? `message:${focusId}` : "",
    focus?.runId ?? null,
  );
  const taken = useRef<Record<string, string>>({});
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    taken.current = {};
  }, [focus?.runId]);
  useEffect(() => {
    if (!live) return;
    for (const name of ["title", "body"] as const) {
      const field = live.fields[name];
      if (!field || field.typing || taken.current[name] === field.value)
        continue;
      taken.current[name] = field.value;
      if (isHers(name, mine.current[name], placed.current[name])) continue;
      const value = tidyField(name, field.value);
      base.current = { ...base.current, [name]: value };
      lay({ ...placed.current, [name]: value });
    }
    // Once it has all been shown, the saved draft takes over: a run replayed
    // at once on a later visit never stands in for what she saved since.
    const run = focus?.runId;
    if (live.settled && run && loadedFor.current !== run) {
      loadedFor.current = run;
      void loadDraft(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on every frame; guarded by `taken` and `loadedFor`
  }, [live]);
  const writing = (name: "title" | "body") =>
    isWriting(
      name,
      live?.fields[name]?.typing ?? false,
      mine.current[name],
      placed.current[name],
    );
  // Written already (the form has it) but not yet reached by the replay: it
  // appears when its turn comes, not all at once.
  const waiting = (name: "title" | "body") =>
    live?.written[name] !== undefined &&
    !live.fields[name] &&
    !isHers(name, mine.current[name], placed.current[name]);
  const shown = (name: "title" | "body") =>
    writing(name)
      ? (live?.fields[name]?.value ?? "")
      : waiting(name)
        ? ""
        : name === "title"
          ? title
          : body;

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

  const { run: saveAsTemplate, loading: savingTemplate } = useAsyncAction(
    async () => {
      if (!title.trim()) return;
      const name = window.prompt("Name this template:", title.trim());
      if (!name) return;
      await saveTemplate({
        name,
        title: title.trim(),
        body,
        link: link.trim() || "",
        link_label: linkLabel,
      });
      toast.success("Template saved");
    },
    { errorToast: "Could not save template" },
  );

  const { run: send, loading: sending } = useAsyncAction(
    async () => {
      if (!title.trim()) return;
      if (mode === "repeating" && !startDate) {
        toast.error("Pick a start date");
        return;
      }
      if (mode === "repeating" && freq === "weekly" && weekday === null) {
        toast.error("Pick a day of the week");
        return;
      }
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
        toast.success("Repeating message created");
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
        toast.success(scheduledAt ? "Message scheduled" : "Message sent");
      }
      if (reviewDraft) {
        // The draft was only ever a template for the announcement just
        // created above — clean it up so it doesn't linger as a duplicate.
        // Best-effort: the real announcement already exists, so a delete
        // failure here must not read as the send itself having failed.
        try {
          await deleteAnnouncement(reviewDraft.id);
        } catch {
          toast.error(
            "Sent, but couldn't remove the draft it was reviewed from.",
          );
        }
        onDraftReviewed?.();
      }
      reset();
      onSent();
    },
    { errorToast: "Failed to send announcement" },
  );

  const sendLabel =
    mode === "repeating"
      ? "Create recurring"
      : scheduledAt
        ? "Schedule"
        : "Send now";
  const sendingLabel =
    mode === "repeating"
      ? "Creating…"
      : scheduledAt
        ? "Scheduling…"
        : "Sending…";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      {reviewDraft && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-sm text-foreground">
          <span>Reviewing draft — nothing sends until you confirm below.</span>
          <button
            type="button"
            onClick={() => {
              onDraftReviewed?.();
              reset();
            }}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setTemplateOpen(true)}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <FileText className="h-4 w-4" /> Start from a template
        </button>
        {title.trim() && (
          <Button
            type="button"
            variant="ghost"
            onClick={saveAsTemplate}
            loading={savingTemplate}
            loadingText="Saving…"
            className="h-auto p-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            Save as template
          </Button>
        )}
      </div>

      {(["title", "body"] as const).some((name) => writing(name)) &&
        live?.working && (
          <WorkingTag
            specialist={live.working.specialist}
            label={tf("writing")}
          />
        )}
      <input
        value={shown("title")}
        readOnly={writing("title")}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
      />

      <button
        type="button"
        disabled={writing("body")}
        onClick={() =>
          editor?.openRichEditor({
            value: body,
            title: "Announcement body",
            onSave: setBody,
          })
        }
        className="w-full rounded-lg border border-dashed border-border bg-background p-3 text-left text-sm text-muted-foreground"
      >
        {shown("body") ? (
          <span dangerouslySetInnerHTML={{ __html: shown("body") }} />
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

      {/* Focus mode's guide asks who gets it and when, and its finish step sends. */}
      {!focus && (
        <>
          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <div className="font-medium">{tr("audience.title")}</div>
            {reach === null ? (
              <div className="text-muted-foreground">
                Calculating who will receive this…
              </div>
            ) : reach.audience === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  No students match these filters — nobody will receive this
                  message.
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background p-2.5">
                <Megaphone className="mr-1 inline h-4 w-4 align-[-3px]" />
                Goes to{" "}
                <strong className="text-foreground">
                  {reach.audience}
                </strong>{" "}
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
            {/* Narrowing by device is the rare case: one line until she opens it. */}
            <details>
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {tr("audience.narrow")}
              </summary>
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
                    {t === "pwa" ? tr("audience.app") : tr("audience.browser")}
                  </button>
                ))}
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`rounded-full border px-3 py-1 ${filters.platform?.includes(p) ? "bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {tr(`audience.${p}`)}
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
                  {tr("audience.push")}
                </button>
              </div>
            </details>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alsoEmail}
              onChange={(e) => setAlsoEmail(e.target.checked)}
            />
            <Mail className="h-4 w-4 text-muted-foreground" />
            {tr("alsoEmail")}
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

          <Button
            onClick={send}
            loading={sending}
            loadingText={sendingLabel}
            disabled={!title.trim()}
            className="rounded-lg px-4 py-2 font-medium"
          >
            {sendLabel}
          </Button>
        </>
      )}

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
              <div className="flex items-center justify-center py-10">
                <Spinner />
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
