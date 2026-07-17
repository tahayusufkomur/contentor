"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientFetch } from "@/lib/api-client";
import { Video, X } from "lucide-react";
import { formatDuration } from "@/lib/format";
import {
  MediaPickerBase,
  uploadToPresignedUrl,
  type PresignResponse,
} from "./media-picker-base";

interface VideoItem {
  id: number;
  title: string;
  duration_seconds: number;
  video_signed_url: string | null;
}

interface VideoPickerProps {
  value: number | null;
  previewUrl: string | null;
  onChange: (videoId: number | null, signedUrl: string | null) => void;
  allowUrl?: boolean;
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

export function VideoPicker({
  value,
  previewUrl,
  onChange,
  allowUrl = false,
}: VideoPickerProps) {
  const [open, setOpen] = useState(false);

  async function fetchVideos(search: string): Promise<VideoItem[]> {
    const params = new URLSearchParams({ limit: "20", offset: "0" });
    if (search) params.set("search", search);
    const res = await clientFetch<{
      results: VideoItem[];
      next: string | null;
    }>(`/api/v1/courses/videos/?${params}`);
    return res.results;
  }

  async function uploadVideo(
    file: File,
    onProgress: (percent: number) => void,
  ) {
    const duration_seconds = await extractDuration(file);
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

    const videoData = await clientFetch<VideoItem>("/api/v1/courses/videos/", {
      method: "POST",
      body: JSON.stringify({ title, description: "" }),
    });

    const { upload_url, s3_key } = await clientFetch<PresignResponse>(
      "/api/v1/upload/presign/",
      {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          category: "library",
        }),
      },
    );

    await uploadToPresignedUrl(upload_url, file, onProgress);

    await clientFetch("/api/v1/upload/complete/", {
      method: "POST",
      body: JSON.stringify({
        s3_key,
        category: "library",
        video_id: videoData.id,
        duration_seconds,
        file_size: file.size,
      }),
    });

    const updated = await clientFetch<VideoItem>(
      `/api/v1/courses/videos/${videoData.id}/`,
    );
    onChange(updated.id, updated.video_signed_url);
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {previewUrl ? (
          <video
            src={previewUrl}
            className="h-16 w-24 rounded-md border object-cover"
            preload="metadata"
          />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-md border bg-muted">
            <Video className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            Choose video
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null, null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {allowUrl && (
        <Input
          value={value == null ? (previewUrl ?? "") : ""}
          onChange={(e) => onChange(null, e.target.value || null)}
          placeholder="YouTube, Vimeo, or direct video URL"
          className="text-sm"
        />
      )}

      <MediaPickerBase<VideoItem>
        open={open}
        onClose={() => setOpen(false)}
        title="Choose a video"
        searchPlaceholder="Search videos..."
        itemLabelPlural="videos"
        accept="video/mp4,video/quicktime,video/webm"
        contentClassName="p-3"
        itemsContainerClassName="space-y-1"
        fetchItems={fetchVideos}
        uploadFile={uploadVideo}
        renderItem={(video) => (
          <button
            key={video.id}
            type="button"
            onClick={() => {
              onChange(video.id, video.video_signed_url);
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{video.title}</span>
            <span className="text-xs text-muted-foreground">
              {formatDuration(video.duration_seconds)}
            </span>
          </button>
        )}
      />
    </div>
  );
}
