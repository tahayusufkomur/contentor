"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import { formatFileSize, formatDate } from "@/lib/format";
import { getFileIcon, getExtension } from "@/lib/file-icons";
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from "@/components/admin/media-browser";
import {
  InlineEditPanel,
  type FieldConfig,
} from "@/components/admin/inline-edit-panel";
import { TagFilterBar } from "@/components/admin/tag-filter-bar";
import { TagInput } from "@/components/admin/tag-input";
import { MonetizeNudge } from "@/components/admin/monetize-nudge";
import { DemoBadge } from "@/components/setup/demo-badge";
import {
  AccessSection,
  type AccessProblem,
} from "@/components/admin/access/access-section";
import { useAccess } from "@/lib/access/use-access";
import { parsePrice } from "@/lib/access/ways";
import { ApiError } from "@/types/api";
import type { DownloadFile } from "@/types/download";

export const dynamic = "force-dynamic";

interface PresignResponse {
  upload_url: string;
  s3_key: string;
}

const SORT_OPTIONS = [
  { label: "Newest", value: "-created_at" },
  { label: "Oldest", value: "created_at" },
  { label: "Name A-Z", value: "title" },
  { label: "Name Z-A", value: "-title" },
  { label: "Largest", value: "-file_size" },
  { label: "Smallest", value: "file_size" },
];

const ACCESS_BADGE_VARIANT: Record<string, "success" | "default" | "warning"> =
  {
    free: "success",
    paid: "default",
    subscription: "warning",
  };

/** The creator's sentence from a refused access save, or "". */
const accessSentence = (err: unknown) =>
  err instanceof ApiError && typeof err.data.detail === "string"
    ? err.data.detail
    : "";

export default function AdminDownloadsPage() {
  const t = useTranslations("admin");
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [showForm, setShowForm] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "" });
  // How students get a new file: the Access section's ways, saved once the file exists.
  const access = useAccess("download", null);
  const [accessProblems, setAccessProblems] = useState<AccessProblem[]>([]);
  const accessDirty =
    !!access.ways &&
    !!access.payload &&
    JSON.stringify(access.ways) !== JSON.stringify(access.payload.ways);
  const [createTagIds, setCreateTagIds] = useState<number[]>([]);

  const [tagFilter, setTagFilter] = useState<number[]>([]);

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<DownloadFile>> => {
      const sp = new URLSearchParams();
      sp.set("limit", String(params.limit));
      sp.set("offset", String(params.offset));
      sp.set("ordering", params.ordering);
      if (params.search) sp.set("search", params.search);
      if (tagFilter.length) sp.set("tags", tagFilter.join(","));
      const data = await clientFetch<{
        results: DownloadFile[];
        next: string | null;
        count: number;
      }>(`/api/v1/downloads/?${sp.toString()}`);
      return { results: data.results, next: data.next, count: data.count };
    },
    [tagFilter],
  );

  const { run: handleFileUpload, loading: uploading } = useAsyncAction(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !form.title.trim()) return;
      if (accessProblems.length) {
        // Cleared so picking the same file again, once fixed, counts.
        e.target.value = "";
        toast.error(accessProblems[0].text);
        return;
      }

      setProgress(0);

      const created = await clientFetch<DownloadFile>("/api/v1/downloads/", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          tag_ids: createTagIds,
        }),
      });

      const { upload_url, s3_key } = await clientFetch<PresignResponse>(
        "/api/v1/upload/presign/",
        {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            category: "download",
            download_id: created.id,
          }),
        },
      );

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", upload_url);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed with status ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      await clientFetch("/api/v1/upload/complete/", {
        method: "POST",
        body: JSON.stringify({
          s3_key,
          category: "download",
          download_id: created.id,
          file_size: file.size,
        }),
      });

      // The file is complete: a refused access setting must say so, not undo it.
      // Untouched ways are the new file's default: nothing to save.
      try {
        if (accessDirty) await access.save(created.id);
        toast.success("File uploaded");
      } catch (err) {
        toast.error(
          `File uploaded, but how students get it was not saved. ${accessSentence(err)}`,
        );
      }
      void access.reload();
      setForm({ title: "" });
      setCreateTagIds([]);
      setShowForm(false);
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to upload file" },
  );

  const downloadFields: FieldConfig<DownloadFile>[] = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "tag_ids", label: "Tags", type: "tags", tagScope: "download" },
  ];

  const { run: handleInlineUpdate, loading: saving } = useAsyncAction(
    async (values: Record<string, unknown>) => {
      await clientFetch(`/api/v1/downloads/${editingId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          title: values.title,
          tag_ids: values.tag_ids ?? [],
        }),
      });
      toast.success("Download updated");
      setEditingId(null);
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to update download" },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("nav.items.downloads")}
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage downloadable files for your students.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            <>
              <X className="h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Upload File
            </>
          )}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload New File
            </CardTitle>
            <CardDescription>
              Enter a title, choose how students get it, then choose a file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dl_title">Title</Label>
              <Input
                id="dl_title"
                placeholder="e.g. Course Workbook"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <AccessSection
              kind="download"
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
            <MonetizeNudge
              price={parsePrice(access.ways?.buy?.price ?? "") ?? undefined}
            />
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagInput
                value={createTagIds}
                onChange={setCreateTagIds}
                scope="download"
              />
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <div className="rounded-lg border-2 border-dashed bg-muted/30 p-6 text-center">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose a file to upload
                </p>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading || !form.title.trim()}
                  className="mt-3 text-sm"
                />
              </div>
            </div>
            {uploading && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {progress}% uploaded
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <MediaBrowser<DownloadFile>
        ref={browserRef}
        persistKey="downloads"
        fetchPage={fetchPage}
        filterKey={tagFilter.join(",")}
        filterSlot={
          <TagFilterBar
            scope="download"
            value={tagFilter}
            onChange={setTagFilter}
          />
        }
        sortOptions={SORT_OPTIONS}
        defaultSort="-created_at"
        emptyIcon={Download}
        emptyMessage="No files uploaded. Upload your first file to get started."
        getItemId={(dl) => dl.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map(
              (id) => () =>
                clientFetch(`/api/v1/downloads/${id}/`, { method: "DELETE" }),
            ),
          );
          toast.success("Files deleted");
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: "Title", key: "title" },
          { label: "Size", key: "size" },
          { label: "Downloads", key: "downloads" },
          { label: "Access", key: "access" },
          { label: "Date", key: "date" },
          { label: "Actions", key: "actions" },
        ]}
        renderGalleryItem={(dl, _selected) => {
          const { icon: FileIcon, color } = getFileIcon(
            dl.file_url || dl.title,
          );
          const ext = getExtension(dl.file_url || dl.title);
          return (
            <div className="group overflow-hidden rounded-lg border bg-card">
              <div className="flex aspect-video flex-col items-center justify-center bg-muted gap-1">
                <FileIcon className={`h-10 w-10 ${color}`} />
                {ext && (
                  <span className="text-xs font-medium text-muted-foreground">
                    {ext}
                  </span>
                )}
              </div>
              <div className="p-3 space-y-2">
                <div className="font-medium truncate">
                  {dl.title}
                  <DemoBadge type="downloads" id={dl.id} />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={ACCESS_BADGE_VARIANT[dl.pricing_type]}>
                    {dl.pricing_type === "free"
                      ? "Free"
                      : dl.pricing_type === "paid"
                        ? "Paid"
                        : "Subscription"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {dl.download_count} downloads
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatFileSize(dl.file_size)}</span>
                  <span>{formatDate(dl.created_at)}</span>
                </div>
              </div>
            </div>
          );
        }}
        renderListRow={(dl) => (
          <>
            <TableCell className="font-medium">
              {dl.title}
              <DemoBadge type="downloads" id={dl.id} />
            </TableCell>
            <TableCell>{formatFileSize(dl.file_size)}</TableCell>
            <TableCell>{dl.download_count}</TableCell>
            <TableCell>
              <Badge variant={ACCESS_BADGE_VARIANT[dl.pricing_type]}>
                {dl.pricing_type === "free"
                  ? "Free"
                  : dl.pricing_type === "paid"
                    ? "Paid"
                    : "Subscription"}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(dl.created_at)}</TableCell>
            <TableCell>
              <DownloadRowActions
                download={dl}
                onEdit={() => setEditingId(dl.id)}
                onDeleted={() => browserRef.current?.refresh()}
              />
            </TableCell>
          </>
        )}
        renderExpandedRow={(dl) =>
          editingId === dl.id ? (
            <TableRow>
              <TableCell colSpan={7} className="p-0">
                <InlineEditPanel
                  item={{ ...dl, tag_ids: (dl.tags ?? []).map((t) => t.id) }}
                  fields={downloadFields}
                  onSave={handleInlineUpdate}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
                <DownloadAccess
                  id={dl.id}
                  onSaved={() => browserRef.current?.refresh()}
                />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  );
}

function DownloadRowActions({
  download,
  onEdit,
  onDeleted,
}: {
  download: DownloadFile;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { run: handleDelete, loading: deleting } = useAsyncAction(
    async () => {
      if (!window.confirm(`Delete "${download.title}"? This cannot be undone.`))
        return;
      await clientFetch(`/api/v1/downloads/${download.id}/`, {
        method: "DELETE",
      });
      toast.success("File deleted");
      onDeleted();
    },
    { errorToast: "Failed to delete file" },
  );
  // `file_url` is the storage key, not an address: ask for a signed link.
  const { run: openFile, loading: opening } = useAsyncAction(
    async () => {
      // Opened inside the click: a tab opened after the request is a popup
      // to Safari, which blocks it.
      const tab = window.open("", "_blank");
      try {
        const { url } = await clientFetch<{ url: string }>(
          `/api/v1/downloads/${download.id}/url/`,
        );
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          window.location.href = url;
        }
      } catch (err) {
        tab?.close();
        throw err;
      }
    },
    { errorToast: "Could not open the file" },
  );

  return (
    <div className="flex items-center gap-1">
      {download.file_url && (
        <Button
          size="sm"
          variant="ghost"
          loading={opening}
          onClick={openFile}
          aria-label="Open file"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={deleting}
        onClick={handleDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** An existing file's Access section, with its own Save. */
function DownloadAccess({ id, onSaved }: { id: number; onSaved: () => void }) {
  const access = useAccess("download", id);
  const [problems, setProblems] = useState<AccessProblem[]>([]);
  const dirty =
    !!access.ways &&
    !!access.payload &&
    JSON.stringify(access.ways) !== JSON.stringify(access.payload.ways);
  const { run: save, loading: saving } = useAsyncAction(
    async () => {
      if (problems.length) {
        toast.error(problems[0].text);
        return;
      }
      await access.save(id);
      toast.success("Access saved");
      onSaved();
    },
    {
      onError: (err) =>
        toast.error(accessSentence(err) || "Failed to save access"),
    },
  );

  return (
    <div className="space-y-3 border-t p-4">
      <AccessSection
        kind="download"
        value={access.ways}
        onChange={access.setWays}
        payload={access.payload}
        onProblems={setProblems}
      />
      {access.error && (
        <p role="alert" className="text-xs text-destructive">
          {access.error}
        </p>
      )}
      <Button
        size="sm"
        onClick={save}
        loading={saving}
        loadingText="Saving…"
        disabled={!dirty}
      >
        Save access
      </Button>
    </div>
  );
}
