"use client";

import { useState, useCallback, useRef } from "react";
import { UploadCloud, File, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { clientFetch } from "@/lib/api-client";

export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "completed" | "error";
  error?: string;
}

interface PresignResponse {
  upload_url: string;
  s3_key: string;
}

interface BatchDropzoneProps {
  category: "photo" | "video";
  accept?: string;
  onUploadComplete?: () => void;
}

export function BatchDropzone({
  category,
  accept = category === "photo" ? "image/*" : "video/*",
  onUploadComplete,
}: BatchDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [windowDragging, setWindowDragging] = useState(false);
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadSingleFile = useCallback(
    async (uploadingFile: UploadingFile) => {
      const file = uploadingFile.file;

      setFiles((prev) =>
        prev.map((f) => (f.id === uploadingFile.id ? { ...f, status: "uploading", progress: 5 } : f))
      );

      try {
        const { upload_url, s3_key } = await clientFetch<PresignResponse>("/api/v1/upload/presign/", {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type,
            category,
          }),
        });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", upload_url);
          xhr.setRequestHeader("Content-Type", file.type);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const pct = Math.round((event.loaded / event.total) * 100);
              setFiles((prev) =>
                prev.map((f) => (f.id === uploadingFile.id ? { ...f, progress: pct } : f))
              );
            }
          };

          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
          xhr.onerror = () => reject(new Error("Network upload error"));
          xhr.send(file);
        });

        // Complete upload registration in Django DB
        const endpoint = category === "photo" ? "/api/v1/photos/" : "/api/v1/videos/";
        const bodyData =
          category === "photo"
            ? { s3_key, title: file.name.replace(/\.[^.]+$/, "") }
            : { s3_key, title: file.name.replace(/\.[^.]+$/, ""), duration_seconds: 60 };

        await clientFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(bodyData),
        });

        setFiles((prev) =>
          prev.map((f) => (f.id === uploadingFile.id ? { ...f, status: "completed", progress: 100 } : f))
        );

        toast.success(`Uploaded ${file.name}`);
        if (onUploadComplete) onUploadComplete();
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadingFile.id ? { ...f, status: "error", error: err?.message || "Failed" } : f
          )
        );
        toast.error(`Failed to upload ${file.name}`);
      }
    },
    [category, onUploadComplete]
  );

  const handleFilesAdded = useCallback(
    (newFiles: FileList | File[]) => {
      const addedList: UploadingFile[] = Array.from(newFiles).map((file) => ({
        id: Math.random().toString(36).substring(2, 9),
        file,
        progress: 0,
        status: "queued",
      }));

      setFiles((prev) => [...prev, ...addedList]);
      addedList.forEach((item) => uploadSingleFile(item));
    },
    [uploadSingleFile]
  );

  useEffect(() => {
    let dragCounter = 0;

    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setWindowDragging(true);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setWindowDragging(false);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setWindowDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFilesAdded(e.dataTransfer.files);
      }
    };

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [handleFilesAdded]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-4">
      {/* Full Window Drop Overlay */}
      {windowDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/20 backdrop-blur-md border-4 border-dashed border-primary animate-in fade-in duration-200 pointer-events-none">
          <div className="bg-card p-8 rounded-2xl shadow-2xl text-center flex flex-col items-center gap-3 border border-primary/30">
            <UploadCloud className="h-16 w-16 text-primary animate-bounce" />
            <h2 className="text-xl font-bold">Drop your {category === "photo" ? "photos" : "videos"} anywhere to upload!</h2>
            <p className="text-xs text-muted-foreground">Release files to start batch upload automatically</p>
          </div>
        </div>
      )}
      {/* Dropzone Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-primary bg-primary/10 scale-[1.01]"
            : "border-border hover:border-primary/50 bg-card hover:bg-muted/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="p-3 rounded-full bg-primary/10 text-primary">
            <UploadCloud className="h-8 w-8" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              Drag & Drop multi-file {category === "photo" ? "photos" : "videos"} here, or{" "}
              <span className="text-primary underline">browse</span>
            </p>

            <p className="text-xs text-muted-foreground mt-1">
              Supports batch uploading • {category === "photo" ? "PNG, JPG, WebP, GIF" : "MP4, MOV, WebM"}
            </p>
          </div>
        </div>
      </div>

      {/* Upload Queue Progress List */}
      {files.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold border-b pb-2">
            <span>Upload Queue ({files.length})</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setFiles([])}
            >
              Clear Finished
            </Button>
          </div>

          <div className="space-y-2.5 max-h-48 overflow-y-auto">
            {files.map((item) => (
              <div key={item.id} className="text-xs space-y-1.5 p-2 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{item.file.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      ({(item.file.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "uploading" && (
                      <span className="font-mono text-[10px] text-primary">{item.progress}%</span>
                    )}
                    {item.status === "completed" && (
                      <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="flex items-center gap-1 text-destructive text-[10px]">
                        <AlertCircle className="h-3.5 w-3.5" /> Error
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {item.status === "uploading" && (
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
