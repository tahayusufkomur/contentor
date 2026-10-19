"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  AccessSection,
  type AccessProblem,
} from "@/components/admin/access/access-section";
import { MonetizeNudge } from "@/components/admin/monetize-nudge";
import { TagInput } from "@/components/admin/tag-input";
import { CoverStep } from "@/components/focus/cover-step";
import { WorkingTag } from "@/components/focus/working-tag";
import { CoverThumb } from "@/components/studio/cover-thumb";
import { OpenStudioButton } from "@/components/studio/open-studio-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccess } from "@/lib/access/use-access";
import { parsePrice } from "@/lib/access/ways";
import { clientFetch } from "@/lib/api-client";
import { useLiveRecord } from "@/lib/copilot/live";
import { listedItem } from "@/lib/covers/items";
import { uploadDownloadFile } from "@/lib/downloads/upload";
import { formatFileSize } from "@/lib/format";
import { EVENT_TIDY, eventOwn } from "@/lib/focus/own-fields";
import { answerCreation } from "@/lib/focus/api";
import {
  applyCreation,
  setFocusSave,
  useActiveCreation,
} from "@/lib/focus/store";
import { ApiError } from "@/types/api";
import type { DownloadFile } from "@/types/download";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

/** Focus mode saves a moment after she stops typing. */
const SAVE_AFTER_MS = 800;

/** The creator's sentence from a refused access save, or "". */
const accessSentence = (err: unknown) =>
  err instanceof ApiError && typeof err.data.detail === "string"
    ? err.data.detail
    : "";

/** The two fields she and the copy run both write (focus mode). */
const OWN = ["title", "description"] as const;
type OwnName = (typeof OWN)[number];
type Own = Record<OwnName, string>;
const ownOf = (d?: DownloadFile | null): Own => ({
  title: d?.title ?? "",
  description: d?.description ?? "",
});
const { isHers, isWriting, layOver } = eventOwn;
const tagIdsOf = (d?: DownloadFile | null) =>
  (d?.tags ?? []).map((tag) => tag.id);
const sameIds = (a: number[], b: number[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** The fields of `mine` that differ from the server's copy (`base`), as a
 *  PATCH sends them; an emptied title is not sent (it is required). */
function ownChanges(mine: Own, base: Own): Partial<Own> {
  const changes: Partial<Own> = {};
  for (const name of OWN) {
    const value = EVENT_TIDY[name](mine[name]);
    if (value !== base[name] && (name !== "title" || value))
      changes[name] = value;
  }
  return changes;
}

/** One download, new or existing: its title, description, cover, file, how
 *  students get it, and its tags. A new one is created on its first save (or
 *  its first file), once, and the page moves to it. */
export function DownloadForm({
  download,
  focus,
}: {
  /** Omitted: a new download. */
  download?: DownloadFile;
  /** Focus mode: the record the copy run writes ("download:<id>"), that run,
   *  replayed live here, and how to load the download again (once the replay
   *  has shown it all, the saved copy takes over). */
  focus?: { record: string; runId: number | null; reload: () => void };
}) {
  const t = useTranslations("admin.downloads");
  const tf = useTranslations("admin.focus");
  const navigate = useNavigate();
  // A create or upload she left behind finishes, but never pulls her back.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The server's latest copy (the page's, then each save's and upload's).
  const [record, setRecord] = useState<DownloadFile | null>(download ?? null);
  const recordRef = useRef(record);
  recordRef.current = record;
  const [own, setOwn] = useState<Own>(() => ownOf(download));
  const [tagIds, setTagIds] = useState<number[]>(() => tagIdsOf(download));
  const tagIdsRef = useRef(tagIds);
  tagIdsRef.current = tagIds;
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [allDetails, setAllDetails] = useState(false);
  const detailsShown = !focus || allDetails;

  // `base` is the title and description as the server last had them, `placed`
  // the copy each field was last GIVEN (a field that differs is hers, saved or
  // not, and no copy or replay ever replaces it), `mine` the form now.
  const base = useRef<Own>(own);
  const placed = useRef<Own>(own);
  const mine = useRef<Own>(own);
  mine.current = own;
  const lay = (next: Own) => {
    const laid = layOver(mine.current, placed.current, next);
    placed.current = laid.placed;
    if (OWN.some((name) => laid.form[name] !== mine.current[name]))
      setOwn((now) => ({ ...now, ...laid.form }));
  };
  /** A fresh copy from the server: fields she has not changed take it. */
  const receive = (fresh: DownloadFile) => {
    const was = recordRef.current;
    recordRef.current = fresh;
    setRecord(fresh);
    base.current = ownOf(fresh);
    lay(ownOf(fresh));
    setTagIds((now) => (sameIds(now, tagIdsOf(was)) ? tagIdsOf(fresh) : now));
  };
  useEffect(() => {
    if (download && download !== recordRef.current) receive(download);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `receive` only reads refs
  }, [download]);

  // How students get it: the Access section's ways, saved with the download.
  const access = useAccess("download", record?.id ?? null);
  const [accessProblems, setAccessProblems] = useState<AccessProblem[]>([]);
  const accessDirty =
    !!access.ways &&
    !!access.payload &&
    JSON.stringify(access.ways) !== JSON.stringify(access.payload.ways);
  const unsaved =
    accessDirty ||
    Object.keys(ownChanges(own, base.current)).length > 0 ||
    !sameIds(tagIds, tagIdsOf(record));

  // Focus mode: the copy run's title and description type in; only the field
  // being written is read-only, and a written value lands unless it is hers.
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
    // Once it has all been shown, the saved download takes over: a run
    // replayed at once on a later visit never stands in for what she saved.
    const run = focus?.runId;
    if (live.settled && run && loadedFor.current !== run) {
      loadedFor.current = run;
      focus?.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lay` only reads refs
  }, [live, focus]);
  // What a save sends: a field the run wrote counts as written even while it
  // is still typing in (the server has it), unless that field is hers.
  const landed = (name: OwnName) => {
    const written = live?.written[name];
    return written !== undefined &&
      taken.current[name] !== written &&
      !isHers(name, mine.current[name], placed.current[name])
      ? written
      : own[name];
  };
  const writing = (name: OwnName) =>
    isWriting(
      name,
      live?.fields[name]?.typing ?? false,
      mine.current[name],
      placed.current[name],
    );
  const shown = (name: OwnName) =>
    writing(name) ? (live?.fields[name]?.value ?? "") : own[name];

  const creation = useActiveCreation();
  // Focus mode's access step writes the ways on the server: the section takes
  // them in, unless she changed them herself and has not saved.
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
  // The guide's file question: a file on the page answers it (dropped on the
  // file row, or there already when she comes back), and a file the guide
  // uploaded is loaded onto the page.
  const fileAsked =
    !!focus &&
    !!creation &&
    creation.id !== 0 &&
    creation.question?.field === "file" &&
    !!record?.file_url
      ? creation.id
      : null;
  useEffect(() => {
    if (!fileAsked) return;
    void answerCreation(fileAsked, { field: "file", value: "uploaded" })
      .then((next) => applyCreation(fileAsked, next))
      .catch(() => {});
  }, [fileAsked]);
  const fileAnswered = creation?.answered.some((line) => line.field === "file");
  useEffect(() => {
    if (focus && fileAnswered && !recordRef.current?.file_url) focus.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once she has answered it
  }, [fileAnswered]);
  const atCover =
    !!focus &&
    !!creation &&
    (creation.question
      ? creation.question.field === "cover"
      : creation.steps.find((step) => !step.done)?.id === "cover");

  // A new download is created once: a second click, or a file picked while
  // the first save is still going, waits on the same request.
  const creating = useRef<Promise<DownloadFile> | null>(null);
  const create = () =>
    (creating.current ??= (async () => {
      const created = await clientFetch<DownloadFile>("/api/v1/downloads/", {
        method: "POST",
        body: JSON.stringify({
          title: own.title.trim(),
          description: own.description,
          tag_ids: tagIds,
        }),
      });
      // It exists now: a refused access setting says so, it does not undo it.
      // Untouched ways are the new download's default: nothing to save.
      if (accessDirty)
        await access
          .save(created.id)
          .catch((err) =>
            toast.error(`${t("accessNotSaved")} ${accessSentence(err)}`),
          );
      return created;
    })().catch((err) => {
      creating.current = null; // nothing was created: a retry may create it
      throw err;
    }));

  /** The new download exists: what she changed while it was being made
   *  (`changed`) is saved too, then the page moves to it if she is still
   *  here. A failed save keeps her here (the form edits the new download now,
   *  so a retry does not create it again). */
  const openCreated = async (created: DownloadFile, changed: boolean) => {
    if (changed) await submitRef.current();
    if (mounted.current) navigate(`/admin/downloads/${created.id}`);
  };

  const submit = async () => {
    if (accessProblems.length) {
      toast.error(accessProblems[0].text);
      return;
    }
    const current = recordRef.current;
    if (!current) {
      const created = await create();
      receive(created);
      toast.success(t("created"));
      // Only the title, description and tags can change during the POST: the
      // Access section is locked while a new download is being made.
      await openCreated(
        created,
        Object.keys(ownChanges(mine.current, ownOf(created))).length > 0 ||
          !sameIds(tagIdsRef.current, tagIdsOf(created)),
      );
      return;
    }
    const saved = await clientFetch<DownloadFile>(
      `/api/v1/downloads/${current.id}/`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: landed("title").trim(),
          description: landed("description"),
          tag_ids: tagIds,
        }),
      },
    );
    receive(saved);
    if (accessDirty) {
      try {
        await access.save(saved.id);
      } catch (err) {
        toast.error(`${t("accessNotSaved")} ${accessSentence(err)}`);
        return;
      }
    }
    toast.success(t("saved"));
  };
  const { run: save, loading: saving } = useAsyncAction(submit, {
    errorToast: t("saveError"),
  });

  const { run: upload, loading: uploading } = useAsyncAction(
    async (file: File | undefined) => {
      if (!file) return;
      if (!own.title.trim()) {
        toast.error(t("titleFirst"));
        return;
      }
      const isNew = !recordRef.current;
      if (isNew && accessProblems.length) {
        toast.error(accessProblems[0].text);
        return;
      }
      const target = recordRef.current ?? (await create());
      if (isNew) receive(target);
      setProgress(0);
      try {
        await uploadDownloadFile(target.id, file, setProgress);
      } catch (err) {
        // Created already: her retry belongs on its own page, not a 2nd create.
        if (isNew)
          await openCreated(target, unsavedRef.current).catch(() =>
            toast.error(t("saveError")),
          );
        throw err;
      } finally {
        setProgress(null);
      }
      toast.success(t("uploaded"));
      // Rendered since: `unsaved` holds everything she changed meanwhile.
      if (isNew) await openCreated(target, unsavedRef.current);
      else
        receive(
          await clientFetch<DownloadFile>(`/api/v1/downloads/${target.id}/`),
        );
    },
    { errorToast: t("uploadFailed") },
  );

  // Focus mode: her title and description are saved as she types (one save
  // at a time), what is still waiting goes when she leaves the page, and
  // "Save & leave" saves everything she changed on the page.
  const focusId = focus ? (record?.id ?? null) : null;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saveOwn = () => {
    const run = queue.current.then(async () => {
      const id = recordRef.current?.id;
      const changes = ownChanges(mine.current, base.current);
      if (!id || !Object.keys(changes).length) return;
      await clientFetch(`/api/v1/downloads/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      base.current = { ...base.current, ...changes };
    });
    queue.current = run.catch(() => {});
    return run;
  };
  const saveOwnRef = useRef(saveOwn);
  saveOwnRef.current = saveOwn;
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;
  useEffect(() => {
    if (!focusId) return;
    const timer = setTimeout(
      () =>
        void saveOwnRef
          .current()
          .catch(() => toast.error(t("saveError"), { id: "download-save" })),
      SAVE_AFTER_MS,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `saveOwn` only reads refs
  }, [own.title, own.description, focusId]);
  useEffect(() => {
    if (!focusId) return;
    setFocusSave(() =>
      unsavedRef.current ? submitRef.current() : Promise.resolve(),
    );
    // Closing the tab: the request has to outlive the page, so it goes at
    // once and does not wait for a save in flight.
    const closing = () => {
      const changes = ownChanges(mine.current, base.current);
      if (Object.keys(changes).length)
        void clientFetch(`/api/v1/downloads/${focusId}/`, {
          method: "PATCH",
          body: JSON.stringify(changes),
          keepalive: true,
        }).catch(() => {});
    };
    window.addEventListener("pagehide", closing);
    return () => {
      window.removeEventListener("pagehide", closing);
      setFocusSave(null);
      // Leaving the page: nobody is left to read a failure, so it is silent.
      void saveOwnRef.current().catch(() => {});
    };
  }, [focusId]);

  const fileName = record?.file_url ? record.file_url.split("/").pop() : "";
  const titleMissing = !own.title.trim();
  const busy = saving || uploading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {record ? record.title : t("new")}
          {record && !record.is_published && (
            <Badge variant="outline">{t("draft")}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Not a <form>: the tag picker takes Enter for itself. */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="download-title">{t("title")}</Label>
              {writing("title") && live?.working && (
                <WorkingTag
                  specialist={live.working.specialist}
                  label={tf("writing")}
                />
              )}
            </div>
            <Input
              id="download-title"
              value={shown("title")}
              readOnly={writing("title")}
              onChange={(e) => setOwn({ ...own, title: e.target.value })}
              placeholder={t("titlePlaceholder")}
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="download-description">{t("description")}</Label>
              {writing("description") && live?.working && (
                <WorkingTag
                  specialist={live.working.specialist}
                  label={tf("writing")}
                />
              )}
            </div>
            <Textarea
              id="download-description"
              value={shown("description")}
              readOnly={writing("description")}
              onChange={(e) => setOwn({ ...own, description: e.target.value })}
              placeholder={t("descriptionPlaceholder")}
              rows={3}
            />
          </div>

          {record && atCover && creation ? (
            <CoverStep
              creationId={creation.id}
              cover={creation.cover}
              item={listedItem(record)}
            />
          ) : (
            <div className="space-y-2">
              <Label>{t("cover")}</Label>
              <div className="flex flex-wrap items-center gap-3">
                <CoverThumb
                  design={record?.cover_design}
                  photoUrl={record?.thumbnail_signed_url}
                  item={listedItem(record ?? { title: own.title })}
                  className="w-48"
                />
                {record && (
                  <OpenStudioButton
                    target={{
                      target_kind: "download",
                      target_key: String(record.id),
                    }}
                    from={record.cover_design?.id}
                    unsaved={unsaved}
                  />
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="download-file">{t("file")}</Label>
            <label
              htmlFor="download-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) void upload(e.dataTransfer.files[0]);
              }}
              className={`block cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                dragging ? "border-primary bg-primary/5" : "bg-muted/30"
              }`}
            >
              <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
              {fileName && (
                <p className="mt-2 truncate text-sm font-medium">
                  {fileName} · {formatFileSize(record?.file_size ?? 0)}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {t(fileName ? "replace" : "choose")}
              </p>
              <input
                id="download-file"
                type="file"
                className="sr-only"
                disabled={busy || titleMissing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // the same file again, once fixed, counts
                  void upload(file);
                }}
              />
            </label>
            {progress !== null && (
              <div className="space-y-1" role="status">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary motion-safe:transition-all motion-safe:duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("progress", { pct: progress })}
                </p>
              </div>
            )}
          </div>

          {/* Locked while a new download is being made: the ways it is created
              with are saved with it, then reloaded for its id. */}
          <fieldset disabled={busy && !download} className="min-w-0">
            <AccessSection
              kind="download"
              value={access.ways}
              onChange={access.setWays}
              payload={access.payload}
              onProblems={setAccessProblems}
            />
          </fieldset>
          {access.error && (
            <p role="alert" className="text-xs text-destructive">
              {access.error}
            </p>
          )}
          <MonetizeNudge
            price={parsePrice(access.ways?.buy?.price ?? "") ?? undefined}
          />

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
          {detailsShown && (
            <div className="space-y-2">
              <Label>{t("tags")}</Label>
              <TagInput value={tagIds} onChange={setTagIds} scope="download" />
            </div>
          )}

          <Button
            onClick={save}
            loading={saving}
            loadingText={t("saving")}
            disabled={titleMissing || busy}
          >
            {t(record ? "save" : "create")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
