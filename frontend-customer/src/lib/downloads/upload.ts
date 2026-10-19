import { clientFetch } from "@/lib/api-client";

/** Put `file` on download `downloadId` (the record exists already): ask for a
 *  signed upload address, PUT the bytes straight to storage (`onProgress`
 *  gets 0-100), then tell the server it is there. A failed step throws; the
 *  record keeps the file it had. */
export async function uploadDownloadFile(
  downloadId: number,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  const { upload_url, s3_key } = await clientFetch<{
    upload_url: string;
    s3_key: string;
  }>("/api/v1/upload/presign/", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type,
      category: "download",
      download_id: downloadId,
    }),
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload_url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
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
      download_id: downloadId,
      file_size: file.size,
    }),
  });
}
