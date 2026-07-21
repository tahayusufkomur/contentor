"use client";

import { useCallback, useRef, useState } from "react";
import { Image as ImageIcon, Pencil, Plus, Trash2, Copy, Code, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import { formatFileSize, formatDate } from "@/lib/format";
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
import { DemoBadge } from "@/components/setup/demo-badge";
import { BatchDropzone } from "@/components/admin/batch-dropzone";
import { LightboxModal, type MediaItemPayload } from "@/components/admin/lightbox-modal";
import type { Photo } from "@/types/photo";

export const dynamic = "force-dynamic";

const SORT_OPTIONS = [
  { label: "Newest", value: "-created_at" },
  { label: "Oldest", value: "created_at" },
  { label: "Name A-Z", value: "title" },
  { label: "Name Z-A", value: "-title" },
  { label: "Largest", value: "-file_size" },
  { label: "Smallest", value: "file_size" },
];

export default function PhotosPage() {
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaItemPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDropzone, setShowDropzone] = useState(false);
  const [tagFilter, setTagFilter] = useState<number[]>([]);

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<Photo>> => {
      const sp = new URLSearchParams();
      sp.set("limit", String(params.limit));
      sp.set("offset", String(params.offset));
      sp.set("ordering", params.ordering);
      if (params.search) sp.set("search", params.search);
      if (tagFilter.length) sp.set("tags", tagFilter.join(","));
      const data = await clientFetch<{
        results: Photo[];
        next: string | null;
        count: number;
      }>(`/api/v1/photos/?${sp.toString()}`);
      return { results: data.results, next: data.next, count: data.count };
    },
    [tagFilter],
  );

  const photoFields: FieldConfig[] = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "alt_text", label: "Alt Text", type: "text" },
    { key: "tag_ids", label: "Tags", type: "tags", tagScope: "photo" },
  ];

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true);
    try {
      await clientFetch(`/api/v1/photos/${editingId}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          alt_text: values.alt_text,
          tag_ids: values.tag_ids ?? [],
        }),
      });
      toast.success("Photo updated");
      setEditingId(null);
      browserRef.current?.refresh();
    } catch {
      toast.error("Failed to update photo");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await clientFetch(`/api/v1/photos/${id}/`, { method: "DELETE" });
      toast.success("Photo deleted");
      browserRef.current?.refresh();
    } catch {
      toast.error("Failed to delete photo");
    }
  }

  const copyCdnUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("CDN Link copied to clipboard!");
  };

  const copyEmbedCode = (url: string, title: string) => {
    const embed = `<img src="${url}" alt="${title}" class="rounded-lg max-w-full" />`;
    navigator.clipboard.writeText(embed);
    toast.success("HTML embed code copied!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Photo Asset Library</h1>
          <p className="text-sm text-muted-foreground">
            Upload, manage, copy CDN links, and embed photos across your platform.
          </p>
        </div>
        <Button
          onClick={() => setShowDropzone((prev) => !prev)}
          className="gap-2 shadow-sm"
        >
          <Plus className="h-4 w-4" /> {showDropzone ? "Hide Uploader" : "Batch Upload"}
        </Button>
      </div>

      {showDropzone && (
        <BatchDropzone
          category="photo"
          onUploadComplete={() => browserRef.current?.refresh()}
        />
      )}

      <MediaBrowser<Photo>
        ref={browserRef}
        persistKey="photos"
        fetchPage={fetchPage}
        filterKey={tagFilter.join(",")}
        filterSlot={
          <TagFilterBar
            scope="photo"
            value={tagFilter}
            onChange={setTagFilter}
          />
        }
        sortOptions={SORT_OPTIONS}
        defaultSort="-created_at"
        emptyIcon={ImageIcon}
        emptyMessage="No photos yet. Upload photos to get started."
        getItemId={(p) => p.id}
        onDelete={async (selection) => {
          let ids = selection.ids;
          if (selection.mode === "all") {
            ids = [];
            let offset = 0;
            while (true) {
              const res = await fetchPage({
                offset,
                limit: 100,
                ordering: selection.ordering,
                search: selection.search,
              });
              ids.push(...res.results.map((p) => p.id));
              if (!res.next) break;
              offset += 100;
            }
          }
          await batchedAsync(
            ids.map(
              (id) => () =>
                clientFetch(`/api/v1/photos/${id}/`, { method: "DELETE" }),
            ),
          );
          toast.success("Photos deleted");
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: "Photo", key: "photo" },
          { label: "Title", key: "title" },
          { label: "Size", key: "size" },
          { label: "Date", key: "date" },
          { label: "Actions", key: "actions" },
        ]}
        renderGalleryItem={(photo) => (
          <div className="group overflow-hidden rounded-xl border bg-card shadow-sm hover:shadow-md transition-all">
            {photo.signed_url ? (
              <div
                className="relative aspect-video overflow-hidden bg-muted cursor-pointer"
                onClick={() =>
                  setPreviewItem({
                    id: photo.id,
                    title: photo.title || "Untitled Photo",
                    type: "photo",
                    url: photo.signed_url!,
                    s3_key: photo.s3_key,
                    file_size: photo.file_size,
                    created_at: photo.created_at,
                  })
                }
              >
                <img
                  src={photo.signed_url}
                  alt={photo.alt_text || photo.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs shadow-md">
                    <Eye className="h-3.5 w-3.5" /> Lightbox
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="p-3 space-y-2">
              <div className="font-medium truncate text-sm">
                {photo.title || "Untitled"}
                <DemoBadge type="photos" id={photo.id} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatFileSize(photo.file_size)}</span>
                <div className="flex items-center gap-1">
                  {photo.signed_url && (
                    <>
                      <button
                        type="button"
                        onClick={() => copyCdnUrl(photo.signed_url!)}
                        className="p-1 hover:text-foreground rounded"
                        title="Copy CDN URL"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => copyEmbedCode(photo.signed_url!, photo.title)}
                        className="p-1 hover:text-foreground rounded"
                        title="Copy HTML Embed"
                      >
                        <Code className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingId(photo.id)}
                    className="p-1 hover:text-foreground rounded"
                    title="Edit Details"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        renderListRow={(photo) => (
          <>
            <TableCell
              className="w-16 cursor-pointer"
              onClick={() =>
                setPreviewItem({
                  id: photo.id,
                  title: photo.title || "Untitled Photo",
                  type: "photo",
                  url: photo.signed_url!,
                  s3_key: photo.s3_key,
                  file_size: photo.file_size,
                  created_at: photo.created_at,
                })
              }
            >
              {photo.signed_url ? (
                <img
                  src={photo.signed_url}
                  alt={photo.alt_text || photo.title}
                  className="h-10 w-14 rounded object-cover shadow-sm hover:scale-105 transition-transform"
                />
              ) : (
                <div className="flex h-10 w-14 items-center justify-center rounded bg-muted">
                  <ImageIcon className="h-4 w-4 text-muted-foreground/30" />
                </div>
              )}
            </TableCell>
            <TableCell className="font-medium">
              {photo.title || "Untitled"}
              <DemoBadge type="photos" id={photo.id} />
            </TableCell>
            <TableCell>{formatFileSize(photo.file_size)}</TableCell>
            <TableCell>{formatDate(photo.created_at)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                {photo.signed_url && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => copyCdnUrl(photo.signed_url!)}
                      title="Copy CDN Link"
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => copyEmbedCode(photo.signed_url!, photo.title)}
                      title="Copy HTML Embed"
                    >
                      <Code className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setEditingId(photo.id)}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive"
                  onClick={() => handleDelete(photo.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(photo) =>
          editingId === photo.id ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel
                  item={{
                    ...photo,
                    tag_ids: (photo.tags ?? []).map((t) => t.id),
                  }}
                  fields={photoFields}
                  onSave={handleInlineUpdate}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              </TableCell>
            </TableRow>
          ) : null
        }
      />

      <LightboxModal item={previewItem} onClose={() => setPreviewItem(null)} />
    </div>
  );
}
