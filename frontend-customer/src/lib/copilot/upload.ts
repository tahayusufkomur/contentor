import { clientFetch } from "@/lib/api-client";
import type { AttachedPhoto } from "./types";

export const MAX_ATTACH_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHED = 3;

interface PresignResponse {
  upload_url: string;
  s3_key: string;
  headers: Record<string, string>;
}

interface PhotoResponse {
  id: string;
  title: string;
  signed_url: string | null;
}

/** Best-effort vision caption ("silhouette of a ballet dancer at a barre").
 * The backend stores it on the Photo row; we carry it into the chat so the
 * assistant can react to — and later retrieve — the photo by content. An
 * empty string (no vision provider, call failed) is a valid answer. */
async function describePhoto(photoId: string): Promise<string> {
  try {
    const { description } = await clientFetch<{ description: string }>(
      "/api/v1/admin/copilot/photos/describe/",
      { method: "POST", body: JSON.stringify({ photo_id: photoId }) },
    );
    return description ?? "";
  } catch {
    return "";
  }
}

/** Same three-step flow the admin media library uses: presign → PUT to
 * object storage → register the Photo row. Returns what the composer chip
 * and the converse call need. Throws on non-image or oversize files so the
 * caller's useAsyncAction shows its toast. */
export async function uploadCopilotPhoto(file: File): Promise<AttachedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  if (file.size > MAX_ATTACH_BYTES) throw new Error("file too large");
  const presign = await clientFetch<PresignResponse>(
    "/api/v1/upload/presign/",
    {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        content_type: file.type,
        category: "photo",
      }),
    },
  );
  const put = await fetch(presign.upload_url, {
    method: "PUT",
    headers: presign.headers,
    body: file,
  });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);
  const photo = await clientFetch<PhotoResponse>("/api/v1/photos/", {
    method: "POST",
    body: JSON.stringify({
      s3_key: presign.s3_key,
      title: file.name.replace(/\.[^.]+$/, ""),
      content_type: file.type,
      file_size: file.size,
    }),
  });
  return {
    id: photo.id,
    title: photo.title,
    signed_url: photo.signed_url ?? "",
    desc: await describePhoto(photo.id),
  };
}
