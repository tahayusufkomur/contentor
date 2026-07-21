"use client";

import { useState, useEffect } from "react";
import { Search, Image as ImageIcon, Video, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientFetch } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

export interface SelectedMediaAsset {
  id: number | string;
  type: "photo" | "video";
  title: string;
  url: string;
  s3_key: string;
}

interface MediaSelectorModalProps {
  open: boolean;
  type?: "photo" | "video" | "any";
  onClose: () => void;
  onSelect: (asset: SelectedMediaAsset) => void;
}

export function MediaSelectorModal({
  open,
  type = "any",
  onClose,
  onSelect,
}: MediaSelectorModalProps) {
  const [activeTab, setActiveTab] = useState<"photo" | "video">(
    type === "video" ? "video" : "photo"
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SelectedMediaAsset[]>([]);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    const endpoint = activeTab === "photo" ? "/api/v1/photos/" : "/api/v1/videos/";
    const sp = new URLSearchParams();
    if (query) sp.set("search", query);

    clientFetch<{ results?: any[] } | any[]>(`${endpoint}?${sp.toString()}`)
      .then((res) => {
        const raw = Array.isArray(res) ? res : res.results || [];
        const mapped: SelectedMediaAsset[] = raw.map((item: any) => ({
          id: item.id,
          type: activeTab,
          title: item.title || "Untitled",
          url: item.photo_signed_url || item.video_signed_url || item.url || "",
          s3_key: item.s3_key,
        }));
        setItems(mapped);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, activeTab, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/30">
          <div>
            <h3 className="text-base font-bold">Select Media Asset</h3>
            <p className="text-xs text-muted-foreground">
              Choose from your photo or video library to insert into your content.
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search & Tabs Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b bg-card">
          {/* Tab Switcher */}
          {type === "any" && (
            <div className="flex items-center border rounded-lg overflow-hidden bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("photo")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === "photo"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Photos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("video")}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === "video"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Video className="h-3.5 w-3.5" />
                Videos
              </button>
            </div>
          )}

          {/* Search Box */}
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={`Search ${activeTab}s...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 text-xs h-9"
            />
          </div>
        </div>

        {/* Thumbnail Picker Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              No {activeTab}s found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    onSelect(asset);
                    onClose();
                  }}
                  className="group relative rounded-xl border bg-card overflow-hidden text-left transition-all hover:ring-2 hover:ring-primary shadow-sm hover:shadow-md aspect-video flex flex-col justify-end p-2"
                >
                  {/* Thumbnail */}
                  {asset.type === "photo" ? (
                    <img
                      src={asset.url}
                      alt={asset.title}
                      className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <video
                      src={asset.url}
                      className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Title overlay */}
                  <span className="relative z-10 text-[11px] font-semibold text-white truncate leading-tight">
                    {asset.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-3 bg-muted/20 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
