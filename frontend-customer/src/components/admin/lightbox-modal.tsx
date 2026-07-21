"use client";

import { useState } from "react";
import { X, Copy, Check, Code, ExternalLink, Download, FileText, Calendar, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatFileSize, formatDate, formatDuration } from "@/lib/format";

export interface MediaItemPayload {
  id: number | string;
  title: string;
  type: "photo" | "video";
  url: string; // CDN signed URL
  s3_key: string;
  file_size?: number;
  duration_seconds?: number;
  created_at?: string;
}

interface LightboxModalProps {
  item: MediaItemPayload | null;
  onClose: () => void;
}

export function LightboxModal({ item, onClose }: LightboxModalProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  if (!item) return null;

  const cdnUrl = item.url;
  const embedCode =
    item.type === "photo"
      ? `<img src="${cdnUrl}" alt="${item.title}" class="rounded-lg max-w-full" />`
      : `<video src="${cdnUrl}" controls class="rounded-lg w-full max-w-2xl"></video>`;

  const copyUrl = () => {
    navigator.clipboard.writeText(cdnUrl);
    setCopiedUrl(true);
    toast.success("CDN URL copied to clipboard!");
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopiedEmbed(true);
    toast.success("HTML embed code copied to clipboard!");
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-2xl border bg-background shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Media Preview Box */}
        <div className="flex-1 bg-black flex items-center justify-center min-h-[300px] md:min-h-[450px] p-4 overflow-hidden">
          {item.type === "photo" ? (
            <img
              src={cdnUrl}
              alt={item.title}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
            />
          ) : (
            <video
              src={cdnUrl}
              controls
              autoPlay
              className="max-h-[75vh] max-w-full rounded-lg shadow-lg"
            />
          )}
        </div>

        {/* Sidebar Info & Copy Actions */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l p-6 space-y-6 flex flex-col justify-between bg-card overflow-y-auto">
          <div className="space-y-4">
            <div>
              <Badge variant="outline" className="uppercase font-mono text-[10px] mb-2">
                {item.type}
              </Badge>
              <h3 className="text-lg font-bold leading-tight break-words">{item.title}</h3>
            </div>

            {/* Metadata Stats */}
            <div className="space-y-2 text-xs text-muted-foreground border-y py-3">
              {item.file_size !== undefined && (
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>Size: {formatFileSize(item.file_size)}</span>
                </div>
              )}

              {item.duration_seconds !== undefined && (
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  <span>Duration: {formatDuration(item.duration_seconds)}</span>
                </div>
              )}

              {item.created_at && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Uploaded: {formatDate(item.created_at)}</span>
                </div>
              )}
            </div>

            {/* One-Click Copy Actions */}
            <div className="space-y-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between gap-2 text-xs"
                onClick={copyUrl}
              >
                <span className="flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5 text-primary" />
                  Copy CDN Link
                </span>
                {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between gap-2 text-xs"
                onClick={copyEmbed}
              >
                <span className="flex items-center gap-1.5">
                  <Code className="h-3.5 w-3.5 text-purple-600" />
                  Copy HTML Embed Code
                </span>
                {copiedEmbed ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onClose}>
              Close Preview
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
