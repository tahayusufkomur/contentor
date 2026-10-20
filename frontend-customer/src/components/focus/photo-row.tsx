"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StaleContainer } from "@/components/ui/stale-container";
import { makePhoto } from "@/lib/covers/generate";
import { generationAllowance } from "@/lib/curated-images-api";
import { SPECIALIST_LOOK } from "@/lib/copilot/team";
import {
  coverAction,
  fetchCoverPhotos,
  type CoverPhoto,
} from "@/lib/focus/api";
import {
  applyCreation,
  setCanMorePhotos,
  usePhotoPage,
} from "@/lib/focus/store";
import { uploadPhoto } from "@/lib/upload";
import { useAsyncAction } from "@shared/hooks/use-async-action";

const TILE = "relative aspect-video w-28 shrink-0 overflow-hidden rounded-md";

const hers = (photo: {
  id: string;
  signed_url: string | null;
  title: string;
}) =>
  photo.signed_url
    ? [
        {
          asset_id: `own:${photo.id}`,
          url: photo.signed_url,
          title: photo.title,
          mine: true,
        },
      ]
    : [];

/** The photo the cover's photo styles share: her photos first, then library
 *  matches for her words, and Upload. A tap puts it into every photo style
 *  (`use`: a photo-only cover's, it is the cover). When her words find
 *  nothing, one photo is made for them (within her monthly allowance) while
 *  she keeps choosing. */
export function PhotoRow({
  creationId,
  query,
  selected,
  action = "photo",
}: {
  creationId: number;
  query: string;
  /** The shared photo's id, if one is set. */
  selected: string | null;
  action?: "photo" | "use";
}) {
  const t = useTranslations("admin");
  // Read from the generation's callbacks, so the effect never reruns for it.
  const say = useRef(t);
  say.current = t;
  const page = usePhotoPage();
  const [photos, setPhotos] = useState<CoverPhoto[] | null>(null);
  const [pending, setPending] = useState(false);
  const [tapped, setTapped] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  // The words whose first page loaded fine and found nothing: only then is a
  // photo made (a failed search must never spend her monthly allowance).
  const [emptyFor, setEmptyFor] = useState<string | null>(null);

  // Page 1 when her words change; the next page appended on "More photos".
  useEffect(() => {
    let cancelled = false;
    setPending(true);
    fetchCoverPhotos(creationId, query, page)
      .then(({ results, has_next }) => {
        if (cancelled) return;
        setPhotos((shown) =>
          page === 1 ? results : [...(shown ?? []), ...results],
        );
        setHasNext(has_next);
        if (page === 1) setEmptyFor(results.length === 0 ? query : null);
      })
      .catch(() => {
        if (!cancelled) setPhotos((shown) => shown ?? []);
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creationId, query, page]);

  // The guide's "More photos" waits for this page and ends with the last.
  useEffect(() => {
    setCanMorePhotos(!pending && hasNext);
  }, [pending, hasNext]);
  useEffect(() => () => setCanMorePhotos(false), []);

  // Nothing fits her words: one new photo for them, if she has any left.
  const nothing = !!query && page === 1 && emptyFor === query;
  useEffect(() => {
    if (!nothing) return;
    const controller = new AbortController();
    generationAllowance()
      .then((allowance) => {
        if (controller.signal.aborted || allowance.left <= 0) return undefined;
        setMaking(true);
        return makePhoto(query, "16:9", { signal: controller.signal });
      })
      .then((photo) => {
        if (photo === undefined || controller.signal.aborted) return;
        // null: the job ended without a photo
        if (!photo) throw new Error("no photo");
        setPhotos((shown) => [...hers(photo), ...(shown ?? [])]);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          toast.error(say.current("focus.photoFailed"));
      })
      .finally(() => setMaking(false));
    return () => controller.abort();
  }, [nothing, query]);

  const { run: choose, loading: choosing } = useAsyncAction(
    async (assetId: string) => {
      setTapped(assetId);
      try {
        applyCreation(
          creationId,
          await coverAction(creationId, { action, asset_id: assetId }),
        );
      } catch (error) {
        setTapped(null); // not chosen after all
        throw error;
      }
    },
    { errorToast: t("focus.photoUnavailable") },
  );

  const { run: upload, loading: uploading } = useAsyncAction(
    async (file: File) => {
      const photo = await uploadPhoto(file, {
        onProgress: () => {},
        signal: new AbortController().signal,
      });
      setPhotos((shown) => [...hers(photo), ...(shown ?? [])]);
      await choose(`own:${photo.id}`);
    },
  );

  const isSelected = (assetId: string) =>
    choosing
      ? assetId === tapped
      : assetId === `own:${selected}` || assetId === tapped;

  return (
    <StaleContainer pending={pending && photos !== null} showLine={false}>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <label
          className={`${TILE} flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-border text-xs text-muted-foreground hover:bg-accent focus-within:ring-2 focus-within:ring-ring`}
        >
          {uploading ? <Spinner size="sm" /> : <Plus className="size-4" />}
          {t("focus.upload")}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {making && (
          <div
            role="status"
            className={`${TILE} flex flex-col items-center justify-center gap-1 border border-border px-2 text-center text-xs text-muted-foreground`}
          >
            <Spinner size="sm" />
            {t("focus.makingPhoto")}
          </div>
        )}
        {photos === null
          ? Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className={TILE} />
            ))
          : photos.map((photo) => (
              <button
                key={photo.asset_id}
                type="button"
                aria-pressed={isSelected(photo.asset_id)}
                disabled={choosing}
                onClick={() => choose(photo.asset_id)}
                className={`${TILE} border border-border`}
                // The Designer's own colour: data, not a theme token.
                style={
                  isSelected(photo.asset_id)
                    ? {
                        outline: `2px solid ${SPECIALIST_LOOK.designer.color}`,
                        outlineOffset: 2,
                      }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived links */}
                <img
                  src={photo.url}
                  alt={photo.title}
                  className="size-full object-cover"
                  loading="lazy"
                />
                {photo.mine && (
                  <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 text-[10px] font-medium text-foreground">
                    {t("focus.yours")}
                  </span>
                )}
                {choosing && tapped === photo.asset_id && (
                  <span className="absolute inset-0 grid place-items-center bg-background/50">
                    <Spinner size="sm" />
                  </span>
                )}
              </button>
            ))}
      </div>
    </StaleContainer>
  );
}
