"use client";

// The one photo picker: the coach's own uploads ("My photos"), the copies
// Contentor placed on her site ("Contentor photos"), or the whole photo library
// (Pix4Less photography, searchable and paged, plus the local decorative
// elements: spot/texture/divider/icon). Either way the pick is materialized
// into a tenant Photo before onSelect fires, so callers only ever see tenant
// photo ids; for library photos that step also copies the image into this
// tenant's own storage.

import { useTenant } from "@/hooks/use-tenant";
import { useCallback, useEffect, useRef, useState } from "react";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { ShapeFilter, type Shape } from "@/components/admin/shape-filter";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StaleContainer } from "@/components/ui/stale-container";
import { clientFetch } from "@/lib/api-client";
import {
  materializeCuratedImage,
  searchCuratedImages,
} from "@/lib/curated-images-api";
import { uploadPhoto } from "@/lib/upload";
import type { Photo } from "@/types/photo";
import {
  type CuratedKind,
  materializeCuratedPhoto,
  searchCuratedPhotos,
} from "@/lib/curated-photos-api";

import { useAsyncAction } from "@shared/hooks/use-async-action";

export interface PickedPhoto {
  id: string;
  url: string | null;
  title: string;
}

type Tab = "mine" | "contentor" | "library";

/** One grid cell, whichever catalog it came from. `source` says how a pick
 *  becomes a tenant photo: already one, copied from the library, or from the
 *  local decorative catalog. */
interface LibraryItem {
  key: string;
  id: string;
  title: string;
  imageUrl: string;
  source: "tenant" | "remote" | "local";
}

type LibraryCategory = "photos" | CuratedKind;

/** Photography (the remote library) first, then the local design elements. */
const CATEGORIES: {
  key: LibraryCategory;
  labelKey: string;
  kind?: CuratedKind;
}[] = [
  { key: "photos", labelKey: "blog.kindPhotos" },
  { key: "spot", labelKey: "blog.kindSpot", kind: "spot" as CuratedKind },
  {
    key: "texture",
    labelKey: "blog.kindTexture",
    kind: "texture" as CuratedKind,
  },
  {
    key: "divider",
    labelKey: "blog.kindDivider",
    kind: "divider" as CuratedKind,
  },
  { key: "icon", labelKey: "blog.kindIcon", kind: "icon" as CuratedKind },
];

const TABS: { key: Tab; labelKey: string }[] = [
  { key: "mine", labelKey: "media.mine" },
  { key: "contentor", labelKey: "media.contentor" },
  { key: "library", labelKey: "blog.libraryTab" },
];

const PAGE_SIZE = 24;

export function ImageLibraryDialog({
  open,
  onOpenChange,
  title,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onSelect: (photo: PickedPhoto) => void | Promise<void>;
}) {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<Tab>("mine");
  const [category, setCategory] = useState<LibraryCategory>("photos");
  // Each section keeps its own search. The library opens on the coach's own
  // niche ("yoga") instead of its random first page; her own photos open
  // unfiltered, since their names rarely say the niche.
  const niche = useTenant()?.niche;
  const [queries, setQueries] = useState<Record<Tab, string>>({
    mine: "",
    contentor: "",
    library: niche && niche !== "general" ? niche.replace(/_/g, " ") : "",
  });
  const query = queries[tab];
  const [shape, setShape] = useState<Shape>("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const decorative =
    tab === "library" &&
    Boolean(CATEGORIES.find((entry) => entry.key === category)?.kind);

  // A new section, category, query or shape starts a fresh result set; only
  // "load more" advances the page, so resetting here keeps the two apart.
  useEffect(() => {
    setPage(1);
  }, [tab, category, query, shape]);

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      let batch: LibraryItem[];
      let more = false;
      const active =
        CATEGORIES.find((entry) => entry.key === category) ?? CATEGORIES[0];
      if (tab !== "library") {
        const params = new URLSearchParams({
          own: tab === "mine" ? "1" : "0",
          limit: String(PAGE_SIZE),
          offset: String((page - 1) * PAGE_SIZE),
        });
        if (query) params.set("search", query);
        if (shape) params.set("shape", shape);
        const data = await clientFetch<{
          results: Photo[];
          next: string | null;
        }>(`/api/v1/photos/?${params}`);
        batch = data.results.map((photo) => ({
          key: photo.id,
          id: photo.id,
          title: photo.title,
          imageUrl: photo.signed_url ?? "",
          source: "tenant",
        }));
        more = Boolean(data.next);
      } else if (!active.kind) {
        const data = await searchCuratedImages({
          q: query,
          page,
          orientation: shape || undefined,
        });
        batch = data.results.map((image) => ({
          key: image.id,
          id: image.id,
          title: image.title,
          imageUrl: image.image_url,
          source: "remote",
        }));
        more = data.has_next;
      } else {
        const rows = await searchCuratedPhotos({ kind: active.kind, q: query });
        batch = rows.map((row) => ({
          key: String(row.id),
          id: String(row.id),
          title: row.title,
          imageUrl: row.image_url,
          source: "local",
        }));
      }
      if (signal.cancelled) return;
      // Page 1 replaces; later pages append to the grid already on screen.
      setItems((current) => (page === 1 ? batch : [...current, ...batch]));
      setHasNext(more);
    },
    [tab, category, query, shape, page],
  );

  useEffect(() => {
    if (!open) return;
    const signal = { cancelled: false };
    setLoading(true);
    setError("");
    load(signal)
      .catch(() => {
        if (signal.cancelled) return;
        setError(t("blog.errGeneric"));
        if (page === 1) setItems([]);
        setHasNext(false);
      })
      .finally(() => {
        if (!signal.cancelled) setLoading(false);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [open, load, page, t]);

  const finish = async (photo: {
    id: string;
    signed_url: string | null;
    title: string;
  }) => {
    await onSelect({ id: photo.id, url: photo.signed_url, title: photo.title });
    onOpenChange(false);
  };

  const { run: pick, loading: busy } = useAsyncAction(
    async (item: LibraryItem) =>
      finish(
        item.source === "remote"
          ? await materializeCuratedImage(item.id)
          : item.source === "local"
            ? await materializeCuratedPhoto(Number(item.id))
            : { id: item.id, signed_url: item.imageUrl, title: item.title },
      ),
    { errorToast: t("blog.errGeneric") },
  );

  // A photo of her own, straight from her device: it lands in My photos and
  // is picked right away.
  const { run: upload, loading: uploading } = useAsyncAction(
    async (file: File) => {
      setProgress(0);
      await finish(
        await uploadPhoto(file, {
          onProgress: setProgress,
          signal: new AbortController().signal,
        }),
      );
    },
    { errorToast: t("blog.libraryUploadFailed") },
  );

  if (!open) return null;

  // Only the very first load blanks the grid; refining a search dims what is
  // already there instead.
  const firstLoad = loading && items.length === 0;
  const empty =
    tab === "mine" && !query && !shape
      ? t("media.emptyMine")
      : tab === "contentor" && !query && !shape
        ? t("media.emptyContentor")
        : t("blog.libraryEmpty");

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4"
        onClick={() => onOpenChange(false)}
      >
        <div
          className="flex h-[90vh] w-full max-w-6xl flex-col gap-3 rounded-xl border bg-background p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              {title ?? t("blog.coverChoose")}
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map(({ key, labelKey }) => (
              <Button
                key={key}
                variant={tab === key ? "default" : "outline"}
                size="sm"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) =>
                setQueries((current) => ({ ...current, [tab]: e.target.value }))
              }
              placeholder={t("blog.librarySearch")}
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              loading={uploading}
              loadingText={`${progress}%`}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {t("blog.libraryUpload")}
            </Button>
          </div>
          {tab === "library" && (
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(({ key, labelKey }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    category === key
                      ? "border-foreground bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          )}
          {/* Design elements have no shape worth filtering on. */}
          {!decorative && <ShapeFilter value={shape} onChange={setShape} />}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PageState
              loading={firstLoad}
              skeleton={
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square w-full" />
                  ))}
                </div>
              }
            >
              <StaleContainer pending={loading}>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((item) => (
                    // Uncropped on a neutral square, so each photo shows its
                    // real shape before she picks it.
                    <button
                      key={item.key}
                      type="button"
                      disabled={busy || uploading}
                      onClick={() => pick(item)}
                      className="flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted/50 p-1 hover:ring-2 hover:ring-ring"
                      title={item.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    </button>
                  ))}
                  {items.length === 0 && !loading && (
                    <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                      {error || empty}
                    </p>
                  )}
                </div>
              </StaleContainer>
              {hasNext && (
                <div className="pt-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={loading}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    {t("blog.libraryMore")}
                  </Button>
                </div>
              )}
            </PageState>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
