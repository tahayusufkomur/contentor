"use client";

import { useTranslations, useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Pencil,
  Trash2,
  Copy,
  Code,
  Eye,
} from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
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
import { ShapeFilter, type Shape } from "@/components/admin/shape-filter";
import { DemoBadge } from "@/components/setup/demo-badge";
import {
  LightboxModal,
  type MediaItemPayload,
} from "@/components/admin/lightbox-modal";
import type { Photo } from "@/types/photo";

/** The order the server is asked for, with the `list.sort` label for each. */
const SORT_OPTIONS = [
  { key: "newest", value: "-created_at" },
  { key: "oldest", value: "created_at" },
  { key: "nameAsc", value: "title" },
  { key: "nameDesc", value: "-title" },
  { key: "largest", value: "-file_size" },
  { key: "smallest", value: "file_size" },
] as const;

/** The photo half of the media library. `refreshSignal` changes when the
 *  page's uploader lands a photo. */
export function PhotosView({ refreshSignal }: { refreshSignal: number }) {
  const locale = useLocale();
  const browserRef = useRef<MediaBrowserHandle>(null);
  const seenSignal = useRef(refreshSignal);
  useEffect(() => {
    // Not on mount: the list is loading anyway, and a second load would race it.
    if (refreshSignal === seenSignal.current) return;
    seenSignal.current = refreshSignal;
    browserRef.current?.refresh();
  }, [refreshSignal]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaItemPayload | null>(null);
  const [tagFilter, setTagFilter] = useState<number[]>([]);
  // Her own uploads apart from the ones Contentor placed (library copies,
  // logo marks, demo content).
  const [source, setSource] = useState<"mine" | "contentor">("mine");
  const [shape, setShape] = useState<Shape>("");
  const t = useTranslations("admin.media");
  const ta = useTranslations("admin");

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<Photo>> => {
      const sp = new URLSearchParams();
      sp.set("limit", String(params.limit));
      sp.set("offset", String(params.offset));
      sp.set("ordering", params.ordering);
      if (params.search) sp.set("search", params.search);
      if (tagFilter.length) sp.set("tags", tagFilter.join(","));
      sp.set("own", source === "mine" ? "1" : "0");
      if (shape) sp.set("shape", shape);
      const data = await clientFetch<{
        results: Photo[];
        next: string | null;
        count: number;
      }>(`/api/v1/photos/?${sp.toString()}`);
      return { results: data.results, next: data.next, count: data.count };
    },
    [tagFilter, source, shape],
  );

  const photoFields: FieldConfig<Photo>[] = [
    { key: "title", label: t("field.title"), type: "text", required: true },
    { key: "alt_text", label: t("field.altText"), type: "text" },
    { key: "tag_ids", label: t("field.tags"), type: "tags", tagScope: "photo" },
  ];

  const { run: handleInlineUpdate, loading: saving } = useAsyncAction(
    async (values: Record<string, unknown>) => {
      await clientFetch(`/api/v1/photos/${editingId}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          alt_text: values.alt_text,
          tag_ids: values.tag_ids ?? [],
        }),
      });
      toast.success(t("toast.photoUpdated"));
      setEditingId(null);
      browserRef.current?.refresh();
    },
    { errorToast: t("toast.photoUpdateFailed") },
  );

  const copyCdnUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success(t("toast.cdnLinkCopied"));
  };

  const copyEmbedCode = (url: string, title: string) => {
    const embed = `<img src="${url}" alt="${title}" class="rounded-lg max-w-full" />`;
    navigator.clipboard.writeText(embed);
    toast.success(t("toast.embedCopied"));
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["mine", "contentor"] as const).map((key) => (
          <Button
            key={key}
            variant={source === key ? "default" : "outline"}
            size="sm"
            aria-pressed={source === key}
            onClick={() => setSource(key)}
          >
            {t(key)}
          </Button>
        ))}
        <div className="ml-auto">
          <ShapeFilter value={shape} onChange={setShape} />
        </div>
      </div>
      <MediaBrowser<Photo>
        ref={browserRef}
        persistKey="photos"
        fetchPage={fetchPage}
        filterKey={`${source}:${shape}:${tagFilter.join(",")}`}
        filterSlot={
          <TagFilterBar
            scope="photo"
            value={tagFilter}
            onChange={setTagFilter}
          />
        }
        sortOptions={SORT_OPTIONS.map((o) => ({
          value: o.value,
          label: ta(`list.sort.${o.key}`),
        }))}
        defaultSort="-created_at"
        emptyIcon={ImageIcon}
        emptyMessage={t(source === "mine" ? "emptyMine" : "emptyContentor")}
        getItemId={(p) => p.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map(
              (id) => () =>
                clientFetch(`/api/v1/photos/${id}/`, { method: "DELETE" }),
            ),
          );
          toast.success(t("toast.photosDeleted"));
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: t("col.photo"), key: "photo" },
          { label: t("col.title"), key: "title" },
          { label: t("col.size"), key: "size" },
          { label: t("col.date"), key: "date" },
          { label: t("col.actions"), key: "actions" },
        ]}
        renderGalleryItem={(photo) => (
          <div className="group overflow-hidden rounded-xl border bg-card shadow-sm hover:shadow-md transition-all">
            {photo.signed_url ? (
              <div
                className="relative aspect-video overflow-hidden bg-muted cursor-pointer"
                onClick={() =>
                  setPreviewItem({
                    id: photo.id,
                    title: photo.title || t("untitledPhoto"),
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
                  className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 gap-1.5 text-xs shadow-md"
                  >
                    <Eye className="h-3.5 w-3.5" /> {t("lightbox")}
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
                {photo.title || t("untitled")}
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
                        title={t("tip.copyCdnUrl")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          copyEmbedCode(photo.signed_url!, photo.title)
                        }
                        className="p-1 hover:text-foreground rounded"
                        title={t("tip.copyEmbed")}
                      >
                        <Code className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingId(photo.id)}
                    className="p-1 hover:text-foreground rounded"
                    title={t("tip.editDetails")}
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
                  title: photo.title || t("untitledPhoto"),
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
              {photo.title || t("untitled")}
              <DemoBadge type="photos" id={photo.id} />
            </TableCell>
            <TableCell>{formatFileSize(photo.file_size)}</TableCell>
            <TableCell>{formatDate(photo.created_at, locale)}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                {photo.signed_url && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => copyCdnUrl(photo.signed_url!)}
                      title={t("tip.copyCdnLink")}
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        copyEmbedCode(photo.signed_url!, photo.title)
                      }
                      title={t("tip.copyEmbed")}
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
                <PhotoDeleteButton
                  photo={photo}
                  onDeleted={() => browserRef.current?.refresh()}
                />
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
    </>
  );
}

function PhotoDeleteButton({
  photo,
  onDeleted,
}: {
  photo: Photo;
  onDeleted: () => void;
}) {
  const t = useTranslations("admin.media");
  const { run: handleDelete, loading: deleting } = useAsyncAction(
    async () => {
      if (!window.confirm(t("confirmDelete", { title: photo.title }))) return;
      await clientFetch(`/api/v1/photos/${photo.id}/`, { method: "DELETE" });
      toast.success(t("toast.photoDeleted"));
      onDeleted();
    },
    { errorToast: t("toast.photoDeleteFailed") },
  );

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 w-8 p-0 text-destructive"
      loading={deleting}
      onClick={handleDelete}
      aria-label={t("delete")}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
