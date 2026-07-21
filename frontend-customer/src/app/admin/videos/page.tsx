"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  Clock,
  FileVideo,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Video,
  X,
  Copy,
  Code,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useChunkedUpload } from "@/hooks/use-chunked-upload";
import { BatchDropzone } from "@/components/admin/batch-dropzone";
import { LightboxModal, type MediaItemPayload } from "@/components/admin/lightbox-modal";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

const ACCEPT = "video/mp4,video/quicktime,video/webm";

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
}

function extractDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.round(video.duration));
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
}

export default function VideosPage() {
  const browserRef = useRef<MediaBrowserHandle>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItemPayload | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useChunkedUpload();

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

  // ---- file selection ----

  async function handleFileSelected(file: File) {
    setSelectedFile(file);
    setTitle(stripExtension(file.name));
    setDescription("");

    // Generate video preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const dur = await extractDuration(file);
    setDuration(dur);

    if (!showUpload) setShowUpload(true);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      handleFileSelected(file);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = "";
  }

  function clearUpload() {
    if (upload.state.uploading) upload.abort();
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDuration(0);
    setTitle("");
    setDescription("");
    setShowUpload(false);
  }

  // ---- upload + create ----

  async function handleStartUpload() {
    if (!selectedFile || !title.trim()) return;

    // Create video record first
    try {
      const videoData = await clientFetch<VideoItem>(
        "/api/v1/courses/videos/",
        {
          method: "POST",
          body: JSON.stringify({ title: title.trim(), description }),
        },
      );

      upload.start({
        category: "library",
        videoId: videoData.id,
        file: selectedFile,
        durationSeconds: duration,
        onComplete: () => {
          toast.success("Video uploaded");
          clearUpload();
          browserRef.current?.refresh();
        },
      });
    } catch {
      toast.error("Failed to create video");
    }
  }

  // ---- edit / delete ----

  const videoFields: FieldConfig<VideoItem>[] = [
    { key: "title", label: "Title", type: "text", required: true },
    { key: "description", label: "Description", type: "textarea" },
    { key: "tag_ids", label: "Tags", type: "tags", tagScope: "video" },
  ];

  async function handleInlineUpdate(values: Record<string, unknown>) {
    setSaving(true);
    try {
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
    } catch {
      toast.error("Failed to update video");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await clientFetch(`/api/v1/courses/videos/${id}/`, { method: "DELETE" });
      toast.success("Video deleted");
      browserRef.current?.refresh();
    } catch {
      toast.error("Failed to delete video");
    }
  }

  // ---- render ----

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Videos</h1>
          <p className="text-sm text-muted-foreground">
            Manage your video library.
          </p>
        </div>
        {!showUpload && (
          <Button onClick={() => setShowUpload(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Upload Video
          </Button>
        )}
      </div>

      {/* Persistent file input — always in DOM so "Change file" works */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileInput}
      />

      {/* ──────── Upload panel ──────── */}
      {showUpload && (
        <div className="rounded-lg border bg-card">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="text-lg font-semibold">Upload Video</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearUpload}
              disabled={upload.state.uploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-6">
            {!selectedFile ? (
              /* ---- Drop zone ---- */
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
                )}
              >
                <div className="rounded-full bg-primary/10 p-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <p className="mt-4 text-sm font-medium">
                  Drag and drop your video here
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  or click to browse
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  MP4, MOV, or WebM
                </p>
              </div>
            ) : (
              /* ---- File selected: preview + form ---- */
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Left: Video preview */}
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-lg bg-black">
                    {previewUrl && (
                      <video
                        src={previewUrl}
                        className="aspect-video w-full object-contain"
                        controls={!upload.state.uploading}
                        preload="metadata"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <FileVideo className="h-4 w-4" />
                      {selectedFile.name}
                    </span>
                    <span>{formatFileSize(selectedFile.size)}</span>
                    {duration > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(duration)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Form + actions */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="v-title">Title</Label>
                    <Input
                      id="v-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Video title"
                      disabled={upload.state.uploading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="v-desc">Description (optional)</Label>
                    <Input
                      id="v-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description"
                      disabled={upload.state.uploading}
                    />
                  </div>

                  {/* Change file */}
                  {!upload.state.uploading && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm text-primary hover:underline"
                    >
                      Change file
                    </button>
                  )}

                  {/* Progress */}
                  {upload.state.uploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Uploading...
                        </span>
                        <span className="font-medium">
                          {upload.state.progress}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${upload.state.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error with retry */}
                  {upload.state.error && (
                    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium text-destructive">
                          Upload failed
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {upload.state.error}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => upload.retry()}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Retry
                      </Button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {upload.state.uploading ? (
                      <Button variant="outline" onClick={() => upload.abort()}>
                        Cancel Upload
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={handleStartUpload}
                          disabled={!title.trim()}
                          className="gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          Upload
                        </Button>
                        <Button variant="ghost" onClick={clearUpload}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────── Media browser ──────── */}
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
              }>(`/api/v1/courses/videos/?${sp}`);
              ids.push(...data.results.map((v) => v.id));
              if (!data.next) break;
              offset += 100;
            }
          }
          await batchedAsync(
            ids.map(
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
                          navigator.clipboard.writeText(video.video_signed_url!);
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
            <TableCell>{formatDate(video.created_at)}</TableCell>
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
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setEditingId(video.id)}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive"
                  onClick={() => handleDelete(video.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
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
    </div>
  );
}
