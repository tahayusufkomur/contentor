export * from "@shared/logo/export";

// ─── Customer-only: tenant-authenticated PNG upload ────────────────
// Uses clientFetch (tenant session), so it lives here, not in @shared.
import { clientFetch } from "@/lib/api-client";

interface PresignResponse {
  upload_url: string;
  s3_key: string;
}

interface CompleteResponse {
  photo_id: string;
  signed_url: string;
}

/** Upload an exported PNG through the existing photo-upload flow (presign → PUT → complete). */
export async function uploadPng(
  blob: Blob,
  filename: string,
  contentType = "image/png",
): Promise<CompleteResponse> {
  const { upload_url, s3_key } = await clientFetch<PresignResponse>(
    "/api/v1/upload/presign/",
    {
      method: "POST",
      body: JSON.stringify({
        filename,
        content_type: contentType,
        category: "photo",
      }),
    },
  );

  const put = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed: ${put.status}`);

  return await clientFetch<CompleteResponse>("/api/v1/upload/complete/", {
    method: "POST",
    body: JSON.stringify({
      s3_key,
      category: "photo",
      content_type: contentType,
      file_size: blob.size,
      title: filename.replace(/\.[^.]+$/, ""),
    }),
  });
}
