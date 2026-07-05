"use client";

import { useCallback, useRef, useState } from "react";
import { clientFetch } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkedUploadOptions {
  category: string;
  videoId: number;
  file: File;
  durationSeconds?: number;
  onProgress?: (percent: number) => void;
  onComplete?: (s3Key: string) => void;
  onError?: (error: Error) => void;
}

interface PartInfo {
  partNumber: number;
  etag: string;
}

export interface ChunkedUploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
  aborted: boolean;
}

export interface ChunkedUploadControls {
  start: (opts: ChunkedUploadOptions) => void;
  abort: () => void;
  retry: () => void;
  state: ChunkedUploadState;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChunkedUpload(): ChunkedUploadControls {
  const [state, setState] = useState<ChunkedUploadState>({
    uploading: false,
    progress: 0,
    error: null,
    aborted: false,
  });

  const abortRef = useRef(false);
  const lastOptsRef = useRef<ChunkedUploadOptions | null>(null);
  // Track completed parts for resume
  const completedPartsRef = useRef<PartInfo[]>([]);
  const uploadMetaRef = useRef<{
    uploadId: string;
    s3Key: string;
    partUrls: string[];
  } | null>(null);

  const uploadPart = useCallback(
    async (
      url: string,
      chunk: Blob,
      onPartProgress: (loaded: number) => void,
    ): Promise<string> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onPartProgress(e.loaded);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const etag = xhr.getResponseHeader("ETag");
            if (etag) {
              resolve(etag);
            } else {
              reject(new Error("Missing ETag in response"));
            }
          } else {
            reject(new Error(`Part upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () =>
          reject(new Error("Network error during part upload"));
        xhr.send(chunk);
      });
    },
    [],
  );

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const start = useCallback(
    async (opts: ChunkedUploadOptions) => {
      lastOptsRef.current = opts;
      abortRef.current = false;

      setState({ uploading: true, progress: 0, error: null, aborted: false });

      const totalParts = Math.ceil(opts.file.size / CHUNK_SIZE);
      const partProgressMap = new Map<number, number>();

      const updateProgress = () => {
        let totalLoaded = 0;
        partProgressMap.forEach((loaded) => {
          totalLoaded += loaded;
        });
        const percent = Math.min(
          99,
          Math.round((totalLoaded / opts.file.size) * 100),
        );
        setState((s) => ({ ...s, progress: percent }));
        opts.onProgress?.(percent);
      };

      try {
        // Initiate multipart upload (or reuse existing for resume)
        let uploadId: string;
        let s3Key: string;
        let partUrls: string[];

        if (uploadMetaRef.current) {
          uploadId = uploadMetaRef.current.uploadId;
          s3Key = uploadMetaRef.current.s3Key;
          partUrls = uploadMetaRef.current.partUrls;
        } else {
          const initRes = await clientFetch<{
            upload_id: string;
            s3_key: string;
            part_urls: string[];
          }>("/api/v1/upload/multipart/initiate/", {
            method: "POST",
            body: JSON.stringify({
              filename: opts.file.name,
              content_type: opts.file.type || "video/mp4",
              category: opts.category,
              video_id: opts.videoId,
              total_parts: totalParts,
            }),
          });
          uploadId = initRes.upload_id;
          s3Key = initRes.s3_key;
          partUrls = initRes.part_urls;
          uploadMetaRef.current = { uploadId, s3Key, partUrls };
          completedPartsRef.current = [];
        }

        // Mark already-completed parts in the progress map
        for (const p of completedPartsRef.current) {
          const chunkStart = (p.partNumber - 1) * CHUNK_SIZE;
          const chunkEnd = Math.min(p.partNumber * CHUNK_SIZE, opts.file.size);
          partProgressMap.set(p.partNumber, chunkEnd - chunkStart);
        }
        updateProgress();

        // Upload remaining parts
        const completedNums = new Set(
          completedPartsRef.current.map((p) => p.partNumber),
        );

        for (let partNum = 1; partNum <= totalParts; partNum++) {
          if (abortRef.current) {
            setState((s) => ({ ...s, uploading: false, aborted: true }));
            return;
          }

          if (completedNums.has(partNum)) continue;

          const chunkStart = (partNum - 1) * CHUNK_SIZE;
          const chunkEnd = Math.min(partNum * CHUNK_SIZE, opts.file.size);
          const chunk = opts.file.slice(chunkStart, chunkEnd);

          // Use pre-signed URL from initiate response (0-indexed array)
          const uploadUrl = partUrls[partNum - 1];

          // Upload with retries
          let etag: string | null = null;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            if (abortRef.current) {
              setState((s) => ({ ...s, uploading: false, aborted: true }));
              return;
            }
            try {
              etag = await uploadPart(uploadUrl, chunk, (loaded) => {
                partProgressMap.set(partNum, loaded);
                updateProgress();
              });
              break;
            } catch (err) {
              if (attempt === MAX_RETRIES - 1) throw err;
              await sleep(RETRY_DELAY_MS * (attempt + 1));
            }
          }

          if (etag) {
            partProgressMap.set(partNum, chunkEnd - chunkStart);
            completedPartsRef.current.push({
              partNumber: partNum,
              etag,
            });
            updateProgress();
          }
        }

        if (abortRef.current) {
          setState((s) => ({ ...s, uploading: false, aborted: true }));
          return;
        }

        // Complete multipart upload (2nd and final API call)
        await clientFetch("/api/v1/upload/multipart/complete/", {
          method: "POST",
          body: JSON.stringify({
            s3_key: s3Key,
            upload_id: uploadId,
            parts: completedPartsRef.current.map((p) => ({
              ETag: p.etag,
              PartNumber: p.partNumber,
            })),
            category: opts.category,
            video_id: opts.videoId,
            duration_seconds: opts.durationSeconds ?? 0,
            file_size: opts.file.size,
          }),
        });

        // Clear refs
        uploadMetaRef.current = null;
        completedPartsRef.current = [];

        setState({
          uploading: false,
          progress: 100,
          error: null,
          aborted: false,
        });
        opts.onComplete?.(s3Key);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setState((s) => ({
          ...s,
          uploading: false,
          error: message,
        }));
        opts.onError?.(err instanceof Error ? err : new Error(message));
      }
    },
    [uploadPart],
  );

  const abort = useCallback(() => {
    abortRef.current = true;
    const meta = uploadMetaRef.current;
    if (meta) {
      // Fire-and-forget abort
      clientFetch("/api/v1/upload/multipart/abort/", {
        method: "POST",
        body: JSON.stringify({
          s3_key: meta.s3Key,
          upload_id: meta.uploadId,
        }),
      }).catch(() => {});
      uploadMetaRef.current = null;
      completedPartsRef.current = [];
    }
    setState((s) => ({ ...s, uploading: false, aborted: true, progress: 0 }));
  }, []);

  const retry = useCallback(() => {
    const opts = lastOptsRef.current;
    if (opts) {
      // Keep uploadMetaRef and completedPartsRef for resume
      start(opts);
    }
  }, [start]);

  return { start, abort, retry, state };
}
