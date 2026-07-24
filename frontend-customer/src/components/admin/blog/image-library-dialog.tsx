"use client";

// Shared picker: curated platform library ("Library") or the tenant's own
// media ("My photos"). Curated picks are materialized into a tenant Photo via
// POST /curated-photos/<id>/use/ before onSelect fires, so callers only ever
// see tenant photo ids.

import { useEffect, useState } from "react";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetch } from "@/lib/api-client";
import {
  type CuratedKind,
  type CuratedPhoto,
  materializeCuratedPhoto,
  searchCuratedPhotos,
} from "@/lib/curated-photos-api";
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

const KINDS: { kind: CuratedKind; labelKey: string }[] = [
  { kind: "hero", labelKey: "blog.kindHero" },
  { kind: "stock", labelKey: "blog.kindStock" },
  { kind: "spot", labelKey: "blog.kindSpot" },
  { kind: "texture", labelKey: "blog.kindTexture" },
  { kind: "divider", labelKey: "blog.kindDivider" },
  { kind: "icon", labelKey: "blog.kindIcon" },
];

export function ImageLibraryDialog({
  open,
  onOpenChange,
  defaultKind = "hero",
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: CuratedKind;
  onSelect: (photo: PickedPhoto) => void;
}) {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<"library" | "mine">("library");
  const [kind, setKind] = useState<CuratedKind>(defaultKind);
  const [query, setQuery] = useState("");
  const [curatedItems, setCuratedItems] = useState<CuratedPhoto[]>([]);
  const [myPhotos, setMyPhotos] = useState<TenantPhoto[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    if (tab === "library") {
      searchCuratedPhotos({ kind, q: query })
        .then((data) => {
          if (!cancelled) setCuratedItems(data);
        })
        .catch(() => {
          if (!cancelled) setCuratedItems([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    } else {
      clientFetch<{ results: TenantPhoto[] }>(
        `/api/v1/photos/?search=${encodeURIComponent(query)}`,
      )
        .then((data) => {
          if (!cancelled) setMyPhotos(data.results ?? []);
        })
        .catch(() => {
          if (!cancelled) setMyPhotos([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, tab, kind, query]);

  const { run: pickCurated, loading: busy } = useAsyncAction(
    async (item: CuratedPhoto) => {
      const photo = await materializeCuratedPhoto(item.id);
      onSelect({ id: photo.id, url: photo.signed_url, title: photo.title });
      onOpenChange(false);
    },
    { errorToast: t("blog.errGeneric") },
  );

  if (!open) return null;

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
            <h2 className="text-base font-semibold">{t("blog.coverChoose")}</h2>
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
              className="ml-auto w-48 rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          {tab === "library" && (
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map(({ kind: k, labelKey }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    kind === k
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
              loading={searching}
              skeleton={
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-video w-full" />
                  ))}
                </div>
              }
            >
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {tab === "library" &&
                  curatedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={busy}
                      onClick={() => pickCurated(item)}
                      className="group overflow-hidden rounded-md border bg-muted/30 hover:ring-2 hover:ring-ring"
                      title={item.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image_url}
                        alt={item.title}
                        loading="lazy"
                        className="aspect-video w-full object-cover"
                      />
                    </button>
                  ))}
                {tab === "mine" &&
                  myPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => {
                        onSelect({
                          id: photo.id,
                          url: photo.signed_url,
                          title: photo.title,
                        });
                        onOpenChange(false);
                      }}
                      className="group overflow-hidden rounded-md border bg-muted/30 hover:ring-2 hover:ring-ring"
                      title={photo.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.signed_url ?? ""}
                        alt={photo.title}
                        loading="lazy"
                        className="aspect-video w-full object-cover"
                      />
                    </button>
                  ))}
                {((tab === "library" && curatedItems.length === 0) ||
                  (tab === "mine" && myPhotos.length === 0)) && (
                  <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                    {t("blog.libraryEmpty")}
                  </p>
                )}
              </div>
            </PageState>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
