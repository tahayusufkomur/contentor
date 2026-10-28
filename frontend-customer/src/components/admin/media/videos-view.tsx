"use client";

import { useTranslations, useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Clock,
  Code,
  Copy,
  Pencil,
  Play,
  Trash2,
  Video,
} from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NavLink } from "@/components/ui/nav-link";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import { formatFileSize, formatDate, formatDuration } from "@/lib/format";
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
import {
  LightboxModal,
  type MediaItemPayload,
} from "@/components/admin/lightbox-modal";

interface VideoItem {
  id: number;
  title: string;
  description: string;
  s3_key: string;
  duration_seconds: number;
  file_size: number;
  video_signed_url: string | null;
  tags?: import("@/types/course").Tag[];
  tag_ids?: number[];
  created_at: string;
}

const SORT_OPTIONS = [
  { label: "Newest", value: "-created_at" },
  { label: "Oldest", value: "created_at" },
  { label: "Name A-Z", value: "title" },
  { label: "Name Z-A", value: "-title" },
  { label: "Largest", value: "-file_size" },
  { label: "Smallest", value: "file_size" },
  { label: "Longest", value: "-duration_seconds" },
  { label: "Shortest", value: "duration_seconds" },
];

/** The video half of the media library. `refreshSignal` changes when the
 *  page's uploader lands a video. */
export function VideosView({ refreshSignal }: { refreshSignal: number }) {
  const locale = useLocale();
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [previewItem, setPreviewItem] = useState<MediaItemPayload | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const seenSignal = useRef(refreshSignal);
  useEffect(() => {
    // Not on mount: the list is loading anyway, and a second load would race it.
    if (refreshSignal === seenSignal.current) return;
    seenSignal.current = refreshSignal;
    browserRef.current?.refresh();
  }, [refreshSignal]);

  const [tagFilter, setTagFilter] = useState<number[]>([]);

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<VideoItem>> => {
      const sp = new URLSearchParams();
      sp.set("limit", String(params.limit));
      sp.set("offset", String(params.offset));
      sp.set("ordering", params.ordering);
      if (params.search) sp.set("search", params.search);
      if (tagFilter.length) sp.set("tags", tagFilter.join(","));
      const data = await clientFetch<{
        results: VideoItem[];
        next: string | null;
        count: number;
      }>(`/api/v1/courses/videos/?${sp.toString()}`);
      return { results: data.results, next: data.next, count: data.count };
    },
    [tagFilter],
  );

  const videoFields: FieldConfig<VideoItem>[] = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea" },
    { key: "tag_ids", label: "Tags", type: "tags", tagScope: "video" },
  ];

  const { run: handleInlineUpdate, loading: saving } = useAsyncAction(
    async (values: Record<string, unknown>) => {
      await clientFetch(`/api/v1/courses/videos/${editingId}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          tag_ids: values.tag_ids ?? [],
        }),
      });
      toast.success("Video updated");
      setEditingId(null);
      browserRef.current?.refresh();
    },
    { errorToast: "Failed to update video" },
  );

  return (
    <>
      <MediaBrowser<VideoItem>
        ref={browserRef}
        persistKey="videos"
        fetchPage={fetchPage}
        filterKey={tagFilter.join(",")}
        filterSlot={
          <TagFilterBar
            scope="video"
            value={tagFilter}
            onChange={setTagFilter}
          />
        }
        sortOptions={SORT_OPTIONS}
        defaultSort="-created_at"
        emptyIcon={Video}
        emptyMessage="No videos yet. Upload one to get started."
        getItemId={(v) => v.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map(
              (id) => () =>
                clientFetch(`/api/v1/courses/videos/${id}/`, {
                  method: "DELETE",
                }),
            ),
          );
          toast.success("Videos deleted");
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: "Title", key: "title" },
          { label: "Duration", key: "duration" },
          { label: "Size", key: "size" },
          { label: "Date", key: "date" },
          { label: "Video", key: "video" },
          { label: "Actions", key: "actions" },
        ]}
        renderGalleryItem={(video) => (
          <div className="group overflow-hidden rounded-xl border bg-card shadow-sm hover:shadow-md transition-all">
            {video.video_signed_url ? (
              <div
                className="relative aspect-video bg-black cursor-pointer overflow-hidden"
                onClick={() =>
                  setPreviewItem({
                    id: video.id,
                    title: video.title || "Untitled Video",
                    type: "video",
                    url: video.video_signed_url!,
                    s3_key: video.s3_key,
                    file_size: video.file_size,
                    duration_seconds: video.duration_seconds,
                    created_at: video.created_at,
                  })
                }
              >
                <video
                  src={video.video_signed_url}
                  className="h-full w-full object-contain"
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="h-10 w-10 text-white drop-shadow-md" />
                </div>
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted">
                <Video className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="p-3 space-y-2">
              <div className="min-w-0">
                <div className="font-medium truncate text-sm">
                  {video.title}
                  <DemoBadge type="videos" id={video.id} />
                </div>
                {video.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {video.description}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(video.duration_seconds)}
                </span>
                <div className="flex items-center gap-1">
                  {video.video_signed_url && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            video.video_signed_url!,
                          );
                          toast.success("CDN Video URL copied!");
                        }}
                        className="p-1 hover:text-foreground rounded"
                        title="Copy CDN Link"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const embed = `<video src="${video.video_signed_url}" controls class="rounded-lg w-full max-w-2xl"></video>`;
                          navigator.clipboard.writeText(embed);
                          toast.success("HTML Video Embed code copied!");
                        }}
                        className="p-1 hover:text-foreground rounded"
                        title="Copy Video Embed"
                      >
                        <Code className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  <NavLink
                    href={`/admin/reels?video=${video.id}`}
                    className="p-1 hover:text-foreground rounded"
                    title="Make reels"
                  >
                    <Clapperboard className="h-3.5 w-3.5" />
                  </NavLink>
                  <button
                    type="button"
                    onClick={() => setEditingId(video.id)}
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
        renderListRow={(video) => (
          <>
            <TableCell className="font-medium">
              <div className="min-w-0">
                <div className="truncate">
                  {video.title}
                  <DemoBadge type="videos" id={video.id} />
                </div>
                {video.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {video.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {formatDuration(video.duration_seconds)}
              </span>
            </TableCell>
            <TableCell>
              {video.file_size > 0 ? formatFileSize(video.file_size) : "---"}
            </TableCell>
            <TableCell>{formatDate(video.created_at, locale)}</TableCell>
            <TableCell>
              <Badge variant={video.video_signed_url ? "success" : "secondary"}>
                {video.video_signed_url ? "Uploaded" : "No video"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                {video.video_signed_url && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        navigator.clipboard.writeText(video.video_signed_url!);
                        toast.success("CDN Video URL copied!");
                      }}
                      title="Copy CDN Link"
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        const embed = `<video src="${video.video_signed_url}" controls class="rounded-lg w-full max-w-2xl"></video>`;
                        navigator.clipboard.writeText(embed);
                        toast.success("HTML Video Embed code copied!");
                      }}
                      title="Copy Video Embed"
                    >
                      <Code className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </>
                )}
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="Make reels"
                >
                  <NavLink href={`/admin/reels?video=${video.id}`}>
                    <Clapperboard className="h-3.5 w-3.5 text-muted-foreground" />
                  </NavLink>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setEditingId(video.id)}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <VideoDeleteButton
                  video={video}
                  onDeleted={() => browserRef.current?.refresh()}
                />
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(video) =>
          editingId === video.id ? (
            <TableRow>
              <TableCell colSpan={7} className="p-0">
                <InlineEditPanel
                  item={{
                    ...video,
                    tag_ids: (video.tags ?? []).map((t) => t.id),
                  }}
                  fields={videoFields}
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

function VideoDeleteButton({
  video,
  onDeleted,
}: {
  video: VideoItem;
  onDeleted: () => void;
}) {
  const t = useTranslations("admin.media");
  const { run: handleDelete, loading: deleting } = useAsyncAction(
    async () => {
      if (!window.confirm(t("confirmDelete", { title: video.title }))) return;
      await clientFetch(`/api/v1/courses/videos/${video.id}/`, {
        method: "DELETE",
      });
      toast.success("Video deleted");
      onDeleted();
    },
    { errorToast: "Failed to delete video" },
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
