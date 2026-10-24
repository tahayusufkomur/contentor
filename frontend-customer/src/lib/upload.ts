import { clientFetch } from "@/lib/api-client";
import type { Photo } from "@/types/photo";

/** The one way a photo or a video gets into the coach's media library:
 *  straight from the browser to storage, then registered with the API. */

export type MediaKind = "photo" | "video";

/** For a file the browser gives no type for (some .mov and .mkv files). */
const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

/** The file's type: what the browser says, else what its name says. */
export function contentType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[extension] ?? "";
}

/** What a dropped file becomes, or null when the library does not take it. */
export function mediaKind(file: {
  name: string;
  type: string;
}): MediaKind | null {
  const type = contentType(file);
  if (type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
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

/** Thrown when she cancels an upload; not a failure to report. */
export class UploadCancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

interface Transfer {
  onProgress: (percent: number) => void;
  /** Aborting it stops the upload and cleans up what was sent. */
  signal: AbortSignal;
}

/** PUT a body to a presigned URL, reporting bytes sent. Resolves with the
 *  response's ETag when storage lets the page read it ("" otherwise). */
function put(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onSent: (bytes: number) => void,
  type?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UploadCancelled());
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const settle = (finish: () => void) => {
      signal.removeEventListener("abort", cancel);
      finish();
    };
    xhr.open("PUT", url);
    if (type) xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onSent(e.loaded);
    };
    xhr.onload = () =>
      settle(() =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve(xhr.getResponseHeader("ETag") ?? "")
          : reject(new Error(`Storage refused the upload (${xhr.status})`)),
      );
    xhr.onerror = () =>
      settle(() => reject(new Error("The connection dropped")));
    xhr.onabort = () => settle(() => reject(new UploadCancelled()));
    xhr.send(body);
  });
}

const percentOf = (sent: number, total: number) =>
  Math.min(99, Math.round((sent / Math.max(total, 1)) * 100));

/** One request for the whole file: presign, then PUT. Returns its key. */
async function putWhole(
  file: File,
  category: "photo" | "library",
  { onProgress, signal }: Transfer,
): Promise<string> {
  const type = contentType(file);
  const { upload_url, s3_key } = await clientFetch<{
    upload_url: string;
    s3_key: string;
  }>("/api/v1/upload/presign/", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content_type: type,
      category,
    }),
  });
  await put(
    upload_url,
    file,
    signal,
    (sent) => onProgress(percentOf(sent, file.size)),
    type,
  );
  return s3_key;
}

/** A photo file's size in pixels, upright (the browser applies the camera's
 *  rotation); null when it cannot be read. */
export async function imageSize(
  file: Blob,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Upload one photo and register it; resolves with its library row. The
 *  server then makes it web-ready (AVIF) and has it described, on its own. */
export async function uploadPhoto(
  file: File,
  transfer: Transfer,
): Promise<Photo> {
  const [s3_key, size] = await Promise.all([
    putWhole(file, "photo", transfer),
    imageSize(file),
  ]);
  return clientFetch<Photo>("/api/v1/photos/", {
    method: "POST",
    body: JSON.stringify({
      s3_key,
      title: titleFromFilename(file.name),
      content_type: contentType(file),
      file_size: file.size,
      ...(size ?? {}),
    }),
  });
}

/** Upload a prepared whiteboard (an Excalidraw `.excalidraw` file) for a
 *  live class or stream; resolves with its storage key, which the event
 *  keeps as `whiteboard_key`. */
export async function uploadWhiteboard(file: File): Promise<string> {
  const type = "application/json";
  const { upload_url, s3_key } = await clientFetch<{
    upload_url: string;
    s3_key: string;
  }>("/api/v1/upload/presign/", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content_type: type,
      category: "whiteboard",
    }),
  });
  await put(upload_url, file, new AbortController().signal, () => {}, type);
  return s3_key;
}

const PART_SIZE = 10 * 1024 * 1024;
const PART_ATTEMPTS = 3;

/** Storage answered a part without an ETag the page can read (its CORS rules
 *  do not expose the header), so the parts cannot be assembled. */
class NoPartReceipt extends Error {}

/** A video goes up in 10 MB parts, each retried, so a long upload survives a
 *  dropped connection. The video only joins her list once its file is whole:
 *  a failed or cancelled upload leaves nothing behind. */
async function uploadVideo(file: File, transfer: Transfer): Promise<void> {
  const { onProgress, signal } = transfer;
  const duration_seconds = await extractDuration(file);
  const title = titleFromFilename(file.name);
  const totalParts = Math.max(1, Math.ceil(file.size / PART_SIZE));

  const started = await clientFetch<{
    upload_id: string;
    s3_key: string;
    part_urls: string[];
  }>("/api/v1/upload/multipart/initiate/", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content_type: contentType(file),
      category: "library",
      total_parts: totalParts,
    }),
  });
  const abandon = () =>
    clientFetch("/api/v1/upload/multipart/abort/", {
      method: "POST",
      body: JSON.stringify({
        s3_key: started.s3_key,
        upload_id: started.upload_id,
      }),
    }).catch(() => {});

  const parts: { ETag: string; PartNumber: number }[] = [];
  try {
    for (let n = 1; n <= totalParts; n++) {
      const from = (n - 1) * PART_SIZE;
      const chunk = file.slice(from, Math.min(n * PART_SIZE, file.size));
      for (let attempt = 1; ; attempt++) {
        try {
          const etag = await put(
            started.part_urls[n - 1],
            chunk,
            signal,
            (sent) => onProgress(percentOf(from + sent, file.size)),
          );
          if (!etag) throw new NoPartReceipt();
          parts.push({ ETag: etag, PartNumber: n });
          break;
        } catch (err) {
          if (
            err instanceof UploadCancelled ||
            err instanceof NoPartReceipt ||
            attempt >= PART_ATTEMPTS
          )
            throw err;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  } catch (err) {
    abandon();
    if (!(err instanceof NoPartReceipt)) throw err;
    // This storage cannot do parts from a browser: send the file in one
    // request instead, the way a photo goes.
    const s3_key = await putWhole(file, "library", transfer);
    await clientFetch("/api/v1/courses/videos/", {
      method: "POST",
      body: JSON.stringify({
        title,
        s3_key,
        duration_seconds,
        file_size: file.size,
      }),
    });
    return;
  }

  // Every part is in storage: now the video gets its row, and the row its file.
  const video = await clientFetch<{ id: number }>("/api/v1/courses/videos/", {
    method: "POST",
    body: JSON.stringify({ title }),
  }).catch((err) => {
    abandon();
    throw err;
  });
  try {
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
    abandon();
    clientFetch(`/api/v1/courses/videos/${video.id}/`, {
      method: "DELETE",
    }).catch(() => {});
    throw err;
  }
}

/** Upload one file into the library. Rejects when the file is neither an
 *  image nor a video, and with UploadCancelled when `signal` aborts. */
export function uploadMedia(file: File, transfer: Transfer): Promise<void> {
  const kind = mediaKind(file);
  if (kind === "photo") return uploadPhoto(file, transfer).then(() => {});
  if (kind === "video") return uploadVideo(file, transfer);
  return Promise.reject(new Error("Only photos and videos go here"));
}
