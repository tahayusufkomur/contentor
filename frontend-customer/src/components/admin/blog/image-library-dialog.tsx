"use client";

// Shared picker: the curated library ("Library") or the tenant's own media ("My
// photos"). The library spans two catalogs — photography from the whole remote
// Pix4Less library (searchable, paged) and the local decorative elements
// (spot/texture/divider/icon). Either way the pick is materialized into
// a tenant Photo before onSelect fires, so callers only ever see tenant photo
// ids; for remote photos that materialize step also copies the image into this
// tenant's own storage.

import { useCallback, useEffect, useState } from "react";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StaleContainer } from "@/components/ui/stale-container";
import { clientFetch } from "@/lib/api-client";
import {
  generateCuratedImage,
  materializeCuratedImage,
  searchCuratedImages,
} from "@/lib/curated-images-api";
import { ApiError } from "@/types/api";
import {
  type CuratedKind,
  materializeCuratedPhoto,
  searchCuratedPhotos,
} from "@/lib/curated-photos-api";
import { toast } from "sonner";

import { useAsyncAction } from "@shared/hooks/use-async-action";

export interface PickedPhoto {
  id: string;
  url: string | null;
  title: string;
}

interface TenantPhoto {
  id: string;
  signed_url: string | null;
  title: string;
}

/** One grid cell, whichever catalog it came from. */
interface LibraryItem {
  key: string;
  id: string;
  title: string;
  imageUrl: string;
  remote: boolean;
}

export type LibraryCategory = "photos" | CuratedKind;

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

export function ImageLibraryDialog({
  open,
  onOpenChange,
  defaultKind = "photos",
  title,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: LibraryCategory;
  title?: string;
  onSelect: (photo: PickedPhoto) => void | Promise<void>;
}) {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<"library" | "mine">("library");
  const [category, setCategory] = useState<LibraryCategory>(defaultKind);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [myPhotos, setMyPhotos] = useState<TenantPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // A new tab, category or query starts a fresh result set; only "load more"
  // advances the page, so resetting here keeps the two apart.
  useEffect(() => {
    setPage(1);
  }, [tab, category, query]);

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      const active =
        CATEGORIES.find((entry) => entry.key === category) ?? CATEGORIES[0];
      if (tab === "mine") {
        const data = await clientFetch<{ results: TenantPhoto[] }>(
          `/api/v1/photos/?search=${encodeURIComponent(query)}`,
        );
        if (signal.cancelled) return;
        setMyPhotos(data.results ?? []);
        setHasNext(false);
        return;
      }
      if (!active.kind) {
        const data = await searchCuratedImages({ q: query, page });
        if (signal.cancelled) return;
        const batch = data.results.map((image) => ({
          key: image.id,
          id: image.id,
          title: image.title,
          imageUrl: image.image_url,
          remote: true,
        }));
        // Page 1 replaces; later pages append to the grid already on screen.
        setItems((current) => (page === 1 ? batch : [...current, ...batch]));
        setHasNext(data.has_next);
        return;
      }
      const rows = await searchCuratedPhotos({ kind: active.kind, q: query });
      if (signal.cancelled) return;
      setItems(
        rows.map((row) => ({
          key: String(row.id),
          id: String(row.id),
          title: row.title,
          imageUrl: row.image_url,
          remote: false,
        })),
      );
      setHasNext(false);
    },
    [tab, category, query, page],
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

  const { run: pick, loading: busy } = useAsyncAction(
    async (item: LibraryItem) => {
      const photo = item.remote
        ? await materializeCuratedImage(item.id)
        : await materializeCuratedPhoto(Number(item.id));
      await onSelect({
        id: photo.id,
        url: photo.signed_url,
        title: photo.title,
      });
      onOpenChange(false);
    },
    { errorToast: t("blog.errGeneric") },
  );

  // "Nothing fits" escape hatch: create the image the coach just described.
  const { run: generate, loading: generating } = useAsyncAction(
    async (prompt: string) => {
      const photo = await generateCuratedImage(prompt);
      if (!photo) {
        toast.error(t("blog.libraryGenerateFailed"));
        return;
      }
      await onSelect({
        id: photo.id,
        url: photo.signed_url,
        title: photo.title,
      });
      onOpenChange(false);
    },
    {
      onError: (err) =>
        toast.error(
          err instanceof ApiError && err.status === 429
            ? t("blog.libraryGenerateLimit")
            : t("blog.libraryGenerateFailed"),
        ),
    },
  );

  if (!open) return null;

  // Only the very first load blanks the grid; refining a search dims what is
  // already there instead.
  const firstLoad = loading && items.length === 0 && myPhotos.length === 0;
  const rows: LibraryItem[] =
    tab === "mine"
      ? myPhotos.map((photo) => ({
          key: photo.id,
          id: photo.id,
          title: photo.title,
          imageUrl: photo.signed_url ?? "",
          remote: false,
        }))
      : items;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-4"
        onClick={() => onOpenChange(false)}
      >
        <div
          className="flex w-full max-w-2xl flex-col gap-4 rounded-xl border bg-background p-6 shadow-2xl"
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
          <div className="flex items-center gap-2">
            <Button
              variant={tab === "library" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("library")}
            >
              {t("blog.libraryTab")}
            </Button>
            <Button
              variant={tab === "mine" ? "default" : "outline"}
              size="sm"
              onClick={() => setTab("mine")}
            >
              {t("blog.myPhotosTab")}
            </Button>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("blog.librarySearch")}
              className="ml-auto w-56 rounded-md border bg-background px-3 py-1.5 text-sm"
            />
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
          <div className="max-h-96 overflow-y-auto">
            <PageState
              loading={firstLoad}
              skeleton={
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-video w-full" />
                  ))}
                </div>
              }
            >
              <StaleContainer pending={loading}>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {rows.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      disabled={busy || generating}
                      onClick={() => pick(item)}
                      className="group overflow-hidden rounded-md border bg-muted/30 hover:ring-2 hover:ring-ring"
                      title={item.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        loading="lazy"
                        className="aspect-video w-full object-cover"
                      />
                    </button>
                  ))}
                  {rows.length === 0 && (
                    <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                      {error || t("blog.libraryEmpty")}
                    </p>
                  )}
                </div>
              </StaleContainer>
              {tab === "library" && category === "photos" && query.trim() && (
                <div className="pt-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={generating}
                    loadingText={t("blog.libraryGenerating")}
                    disabled={busy}
                    onClick={() => generate(query.trim())}
                  >
                    {t("blog.libraryGenerate", { query: query.trim() })}
                  </Button>
                </div>
              )}
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
