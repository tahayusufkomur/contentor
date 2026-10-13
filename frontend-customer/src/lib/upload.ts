import { clientFetch } from "@/lib/api-client";

/** The one way a photo or a video gets into the coach's media library:
 *  straight from the browser to storage, then registered with the API. */

export type MediaKind = "photo" | "video";

/** What a dropped file becomes, or null when the library does not take it. */
export function mediaKind(file: { type: string }): MediaKind | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

/** "morning_flow-01.mp4" → "morning flow 01". */
export function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/** A video file's length in whole seconds, read from its metadata in the
 *  browser; 0 when the browser cannot read it. */
export function extractDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
}

/** PUT a body to a presigned URL, reporting bytes sent. Resolves with the
 *  response's ETag (storage returns one per part). */
function put(
  url: string,
  body: Blob,
  onSent: (bytes: number) => void,
  contentType?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onSent(e.loaded);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag") ?? "")
        : reject(new Error(`Storage refused the upload (${xhr.status})`));
    xhr.onerror = () => reject(new Error("The connection dropped"));
    xhr.send(body);
  });
}

type Progress = (percent: number) => void;

async function uploadPhoto(file: File, onProgress: Progress): Promise<void> {
  const { upload_url, s3_key } = await clientFetch<{
    upload_url: string;
    s3_key: string;
  }>("/api/v1/upload/presign/", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type,
      category: "photo",
    }),
  });
  await put(
    upload_url,
    file,
    (sent) => onProgress(Math.min(99, Math.round((sent / file.size) * 100))),
    file.type,
  );
  await clientFetch("/api/v1/photos/", {
    method: "POST",
    body: JSON.stringify({
      s3_key,
      title: titleFromFilename(file.name),
      content_type: file.type,
      file_size: file.size,
    }),
  });
}

const PART_SIZE = 10 * 1024 * 1024;
const PART_ATTEMPTS = 3;

/** A video goes up in 10 MB parts, each retried, so a long upload survives a
 *  dropped connection. If it still fails, the half-made video is removed. */
async function uploadVideo(file: File, onProgress: Progress): Promise<void> {
  const duration_seconds = await extractDuration(file);
  const video = await clientFetch<{ id: number }>("/api/v1/courses/videos/", {
    method: "POST",
    body: JSON.stringify({ title: titleFromFilename(file.name) }),
  });
  let multipart: { s3_key: string; upload_id: string } | null = null;
  try {
    const totalParts = Math.max(1, Math.ceil(file.size / PART_SIZE));
    const started = await clientFetch<{
      upload_id: string;
      s3_key: string;
      part_urls: string[];
    }>("/api/v1/upload/multipart/initiate/", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        content_type: file.type,
        category: "library",
        video_id: video.id,
        total_parts: totalParts,
      }),
    });
    multipart = started;

    const parts: { ETag: string; PartNumber: number }[] = [];
    for (let n = 1; n <= totalParts; n++) {
      const from = (n - 1) * PART_SIZE;
      const chunk = file.slice(from, Math.min(n * PART_SIZE, file.size));
      for (let attempt = 1; ; attempt++) {
        try {
          const etag = await put(started.part_urls[n - 1], chunk, (sent) =>
            onProgress(
              Math.min(99, Math.round(((from + sent) / file.size) * 100)),
            ),
          );
          if (!etag) throw new Error("Storage did not confirm a part");
          parts.push({ ETag: etag, PartNumber: n });
          break;
        } catch (err) {
          if (attempt >= PART_ATTEMPTS) throw err;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    await clientFetch("/api/v1/upload/multipart/complete/", {
      method: "POST",
      body: JSON.stringify({
        s3_key: started.s3_key,
        upload_id: started.upload_id,
        parts,
        category: "library",
        video_id: video.id,
        duration_seconds,
        file_size: file.size,
      }),
    });
  } catch (err) {
    // Leave nothing behind: no parts in storage, no empty video in her list.
    if (multipart) {
      clientFetch("/api/v1/upload/multipart/abort/", {
        method: "POST",
        body: JSON.stringify({
          s3_key: multipart.s3_key,
          upload_id: multipart.upload_id,
        }),
      }).catch(() => {});
    }
    clientFetch(`/api/v1/courses/videos/${video.id}/`, {
      method: "DELETE",
    }).catch(() => {});
    throw err;
  }
}

/** Upload one file into the library. Rejects when the file is neither an
 *  image nor a video. */
export function uploadMedia(file: File, onProgress: Progress): Promise<void> {
  const kind = mediaKind(file);
  if (kind === "photo") return uploadPhoto(file, onProgress);
  if (kind === "video") return uploadVideo(file, onProgress);
  return Promise.reject(new Error("Only photos and videos go here"));
}
