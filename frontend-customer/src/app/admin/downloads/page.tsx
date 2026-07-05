"use client";

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

export default function AdminDownloadsPage() {
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    pricing_type: "free" as "free" | "paid" | "subscription",
    price: "",
  });
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !form.title.trim()) return;

    setUploading(true);
    setProgress(0);

    try {
      const created = await clientFetch<DownloadFile>("/api/v1/downloads/", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          pricing_type: form.pricing_type,
          ...(form.pricing_type === "paid" && form.price
            ? { price: parseFloat(form.price) }
            : {}),
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
        }),
      });

      toast.success("File uploaded");
      setForm({ title: "", pricing_type: "free", price: "" });
      setCreateTagIds([]);
      setShowForm(false);
      browserRef.current?.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  const downloadFields: FieldConfig<DownloadFile>[] = [
    { key: "title", label: "Title", type: "text", required: true },
    {
      key: "pricing_type",
      label: "Access",
      type: "select",
      options: [
        { label: "Free", value: "free" },
        { label: "Paid", value: "paid" },
        { label: "Included in subscription", value: "subscription" },
      ],
    },
    {
      key: "price",
      label: "Price",
      type: "number",
      placeholder: "0.00",
      showWhen: (v) => v.pricing_type === "paid",
    },
    { key: "tag_ids", label: "Tags", type: "tags", tagScope: "download" },
  ];

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true);
    try {
      await clientFetch(`/api/v1/downloads/${editingId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          title: values.title,
          pricing_type: values.pricing_type,
          tag_ids: values.tag_ids ?? [],
          ...(values.pricing_type === "paid" && values.price
            ? { price: parseFloat(values.price as string) }
            : {}),
        }),
      });
      toast.success("Download updated");
      setEditingId(null);
      browserRef.current?.refresh();
    } catch {
      toast.error("Failed to update download");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await clientFetch(`/api/v1/downloads/${id}/`, { method: "DELETE" });
      toast.success("File deleted");
      browserRef.current?.refresh();
    } catch {
      toast.error("Failed to delete file");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Downloads</h1>
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
              Enter a title and select the access type, then choose a file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <div className="space-y-2">
                <Label htmlFor="dl_access">Access Type</Label>
                <select
                  id="dl_access"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={form.pricing_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      pricing_type: e.target.value as
                        | "free"
                        | "paid"
                        | "subscription",
                    })
                  }
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="subscription">Included in subscription</option>
                </select>
              </div>
            </div>
            {form.pricing_type === "paid" && (
              <div className="space-y-2">
                <Label htmlFor="dl_price">Price</Label>
                <Input
                  id="dl_price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
                <MonetizeNudge price={form.price} />
              </div>
            )}
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
          let ids = selection.ids;
          if (selection.mode === "all") {
            ids = [];
            let offset = 0;
            while (true) {
              const sp = new URLSearchParams();
              sp.set("limit", "100");
              sp.set("offset", String(offset));
              sp.set("ordering", selection.ordering);
              if (selection.search) sp.set("search", selection.search);
              const data = await clientFetch<{
                results: { id: number }[];
                next: string | null;
              }>(`/api/v1/downloads/?${sp}`);
              ids.push(...data.results.map((d) => d.id));
              if (!data.next) break;
              offset += 100;
            }
          }
          await batchedAsync(
            ids.map(
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
                <p className="font-medium truncate">{dl.title}</p>
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
            <TableCell className="font-medium">{dl.title}</TableCell>
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
              <div className="flex items-center gap-1">
                {dl.file_url && (
                  <Button asChild size="sm" variant="ghost">
                    <a
                      href={dl.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(dl.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(dl.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
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
              </TableCell>
            </TableRow>
          ) : null
        }
      />
    </div>
  );
}
