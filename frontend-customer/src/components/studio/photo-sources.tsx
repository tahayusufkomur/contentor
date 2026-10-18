"use client";

// Where a cover's photo comes from, in three tabs: her own photos (Yours), Contentor's library, and a new
// photo made from a description (New). Whatever she picks arrives at `onPick` as one of her own photos:
// a library photo is copied into her storage first. Shared by the simple controls and, later, the
// desktop editor's photo drawer.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StaleContainer } from "@/components/ui/stale-container";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTenant } from "@/hooks/use-tenant";
import { clientFetch } from "@/lib/api-client";
import { makePhoto } from "@/lib/covers/generate";
import { nearestGenerationAspect } from "@/lib/covers/recipe";
import {
  materializeCuratedImage,
  searchCuratedImages,
  type CuratedImage,
} from "@/lib/curated-images-api";
import { uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { ApiError } from "@/types/api";
import type { Photo } from "@/types/photo";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { CoverAspect } from "@shared/sections/types";

export interface PickedPhoto {
  id: string;
  /** A link the page can draw it from. */
  url: string;
}

export interface PhotoSourcesProps {
  /** The shape of the look's cover Card, which a new photo is made for. */
  cardAspect: CoverAspect;
  /** Library photos already on a cover: asset id to the title of what wears it. */
  inUse: Record<string, string>;
  /** New photos she can still make this month. */
  generationsLeft: number;
  onPick: (photo: PickedPhoto) => void;
  /** True while a new photo is being made, so the cover can hold the place of its photo. */
  onGenerating?: (generating: boolean) => void;
}

type Tab = "yours" | "contentor" | "new";
const PAGE_SIZE = 24;

function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** A searchable, paged list. A new query keeps the rows on screen until its first page arrives (the
 *  caller dims them while `loading`); "more" adds the next page. An answer that is no longer the latest
 *  question's is dropped. */
function usePagedSearch<T>(
  fetchPage: (
    query: string,
    page: number,
  ) => Promise<{ items: T[]; hasNext: boolean }>,
  query: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const latest = useRef(0);

  const load = useCallback(async (q: string, next: number) => {
    const mine = ++latest.current;
    setLoading(true);
    setError(false);
    try {
      const result = await fetchRef.current(q, next);
      if (mine !== latest.current) return;
      setItems((now) =>
        next === 1 ? result.items : [...now, ...result.items],
      );
      setPage(next);
      setHasNext(result.hasNext);
    } catch {
      if (mine === latest.current) setError(true);
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query, 1);
  }, [load, query, attempt]);

  return {
    items,
    loading,
    error,
    hasNext,
    more: () => load(query, page + 1),
    retry: () => setAttempt((n) => n + 1),
    prepend: (item: T) => setItems((now) => [item, ...now]),
  };
}

function PhotoTile({
  src,
  title,
  note,
  dim = false,
  busy = false,
  disabled = false,
  onPick,
}: {
  src: string;
  title: string;
  note?: string;
  dim?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        className="group block w-full space-y-1 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none"
      >
        <span className="relative block aspect-[4/3] overflow-hidden rounded-md bg-muted ring-ring ring-offset-2 ring-offset-background group-hover:ring-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn("size-full object-cover", dim && "opacity-50")}
          />
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-background/60">
              <Spinner size="sm" />
            </span>
          )}
        </span>
        <span className="line-clamp-2 block text-xs leading-tight">
          {title}
        </span>
        {note && (
          <span className="block text-xs leading-tight text-muted-foreground">
            {note}
          </span>
        )}
      </button>
    </li>
  );
}

/** The rows of a list of photos, the first load as a skeleton and later ones dimmed. */
function Results({
  list,
  empty,
  children,
}: {
  list: {
    loading: boolean;
    error: boolean;
    hasNext: boolean;
    retry: () => void;
    more: () => void;
  };
  empty: string | null;
  children: ReactNode;
}) {
  const t = useTranslations("admin.studio.photos");
  const none = !list.loading && !list.error && empty;
  return (
    <div className="space-y-3">
      <StaleContainer pending={list.loading}>
        <ul className="grid grid-cols-2 gap-2">{children}</ul>
      </StaleContainer>
      {list.error && (
        <div role="alert" className="space-y-2 text-sm text-muted-foreground">
          <p>{t("failed")}</p>
          <Button size="sm" variant="outline" onClick={list.retry}>
            {t("retry")}
          </Button>
        </div>
      )}
      {none && <p className="text-sm text-muted-foreground">{empty}</p>}
      {list.hasNext && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          loading={list.loading}
          onClick={list.more}
        >
          {t("more")}
        </Button>
      )}
    </div>
  );
}

const GridSkeleton = () => (
  <div className="grid grid-cols-2 gap-2">
    {Array.from({ length: 4 }).map((_, i) => (
      <Skeleton key={i} className="aspect-[4/3] w-full" />
    ))}
  </div>
);

async function fetchYours(query: string, page: number) {
  const params = new URLSearchParams({
    own: "1",
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
  });
  if (query) params.set("search", query);
  const data = await clientFetch<{ results: Photo[]; next: string | null }>(
    `/api/v1/photos/?${params}`,
  );
  return {
    // one with no link cannot be shown, so it cannot be picked
    items: data.results.filter((photo) => photo.signed_url),
    hasNext: Boolean(data.next),
  };
}

function YoursPanel({ onPick }: { onPick: (photo: PickedPhoto) => void }) {
  const t = useTranslations("admin.studio.photos");
  const [query, setQuery] = useState("");
  const list = usePagedSearch(fetchYours, useDebounced(query));
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);

  // Straight from her device: it joins Yours and is picked at once.
  const { run: upload, loading: uploading } = useAsyncAction(
    async (file: File) => {
      setProgress(0);
      const photo = await uploadPhoto(file, {
        onProgress: setProgress,
        signal: new AbortController().signal,
      });
      if (!photo.signed_url) throw new Error("No link for the new photo");
      list.prepend(photo);
      onPick({ id: photo.id, url: photo.signed_url });
    },
    { errorToast: t("uploadFailed") },
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={t("upload")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <Button
          variant="outline"
          className="h-10 shrink-0"
          loading={uploading}
          loadingText={`${progress}%`}
          onClick={() => fileInput.current?.click()}
        >
          {t("upload")}
        </Button>
      </div>
      {list.loading && list.items.length === 0 ? (
        <GridSkeleton />
      ) : (
        <Results
          list={list}
          empty={
            list.items.length === 0 ? t(query ? "noMatch" : "emptyYours") : null
          }
        >
          {list.items.map((photo) => (
            <PhotoTile
              key={photo.id}
              src={photo.signed_url ?? ""}
              title={photo.title}
              onPick={() =>
                photo.signed_url &&
                onPick({ id: photo.id, url: photo.signed_url })
              }
            />
          ))}
        </Results>
      )}
    </div>
  );
}

async function fetchLibrary(query: string, page: number) {
  const result = await searchCuratedImages({ q: query, page });
  return { items: result.results, hasNext: result.has_next };
}

function ContentorPanel({
  inUse,
  onPick,
}: {
  inUse: Record<string, string>;
  onPick: (photo: PickedPhoto) => void;
}) {
  const t = useTranslations("admin.studio.photos");
  const niche = useTenant()?.niche;
  // It opens on her own subject, not on whatever the library lists first.
  const [query, setQuery] = useState(
    niche && niche !== "general" ? niche.replace(/_/g, " ") : "",
  );
  const list = usePagedSearch(fetchLibrary, useDebounced(query));
  const [picking, setPicking] = useState<string | null>(null);

  const { run: pick, loading: busy } = useAsyncAction(
    async (image: CuratedImage) => {
      setPicking(image.id);
      try {
        const photo = await materializeCuratedImage(image.id);
        if (!photo.signed_url) throw new Error("No link for the photo");
        onPick({ id: photo.id, url: photo.signed_url });
      } finally {
        setPicking(null);
      }
    },
    { errorToast: t("pickFailed") },
  );

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
      />
      {list.loading && list.items.length === 0 ? (
        <GridSkeleton />
      ) : (
        <Results
          list={list}
          empty={list.items.length === 0 ? t("emptyLibrary") : null}
        >
          {list.items.map((image) => (
            <PhotoTile
              key={image.id}
              src={image.image_url}
              title={image.title}
              note={
                inUse[image.id]
                  ? t("inUse", { title: inUse[image.id] })
                  : undefined
              }
              dim={Boolean(inUse[image.id])}
              busy={picking === image.id}
              disabled={busy}
              onPick={() => void pick(image)}
            />
          ))}
        </Results>
      )}
    </div>
  );
}

function NewPanel({
  cardAspect,
  left,
  onStart,
  onUsedUp,
  onPick,
  onGenerating,
}: {
  cardAspect: CoverAspect;
  left: number;
  /** The job is on its way: it counts against this month. */
  onStart: () => void;
  /** The server says this month's photos are all used. */
  onUsedUp: () => void;
  onPick: (photo: PickedPhoto) => void;
  onGenerating?: (generating: boolean) => void;
}) {
  const t = useTranslations("admin.studio.photos");
  const field = useId();
  const [prompt, setPrompt] = useState("");
  const asking = useRef<AbortController | null>(null);
  // Leaving the page stops the asking; the photo is paid for either way.
  useEffect(() => () => asking.current?.abort(), []);

  const { run: make, loading } = useAsyncAction(
    async () => {
      const controller = (asking.current = new AbortController());
      onGenerating?.(true);
      try {
        const photo = await makePhoto(
          prompt.trim(),
          nearestGenerationAspect(cardAspect),
          { signal: controller.signal, onStart },
        );
        // makePhoto rejects once she has left; this is the second lock on the same door, so whatever it
        // returns, a photo that arrives after she left is not put on a cover nobody is editing.
        if (controller.signal.aborted) return;
        if (!photo?.signed_url) throw new Error("The job made no photo");
        onPick({ id: photo.id, url: photo.signed_url });
      } finally {
        onGenerating?.(false);
      }
    },
    {
      onError: (error) => {
        if (asking.current?.signal.aborted) return;
        const usedUp = error instanceof ApiError && error.status === 429;
        if (usedUp) onUsedUp();
        toast.error(usedUp ? t("used") : t("makeFailed"));
      },
    },
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={field}>{t("describe")}</Label>
        <Textarea
          id={field}
          rows={3}
          value={prompt}
          disabled={loading}
          maxLength={500}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("describePlaceholder")}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {left > 0 ? t("left", { count: left }) : t("used")}
      </p>
      <Button
        onClick={() => void make()}
        loading={loading}
        loadingText={t("making")}
        disabled={left <= 0 || !prompt.trim()}
      >
        <Sparkles />
        {t("make")}
      </Button>
      {loading ? (
        <div role="status" className="space-y-1.5">
          <Skeleton
            className="w-full"
            style={{ aspectRatio: cardAspect.replace("/", " / ") }}
          />
          <p className="text-xs text-muted-foreground">{t("wait")}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("takes")}</p>
      )}
    </div>
  );
}

export function PhotoSources({
  cardAspect,
  inUse,
  generationsLeft,
  onPick,
  onGenerating,
}: PhotoSourcesProps) {
  const t = useTranslations("admin.studio.photos");
  const id = useId();
  const [tab, setTab] = useState<Tab>("yours");
  // The library is only asked once she opens it; a tab she has left stays as she left it.
  const [seen, setSeen] = useState<Tab[]>(["yours"]);
  const [left, setLeft] = useState(generationsLeft);
  const show = (next: string) => {
    setTab(next as Tab);
    setSeen((now) => (now.includes(next as Tab) ? now : [...now, next as Tab]));
  };
  const panel = (name: Tab, content: ReactNode) =>
    seen.includes(name) && (
      <div
        role="tabpanel"
        id={`${id}-${name}`}
        aria-labelledby={`${id}-${name}-tab`}
        hidden={tab !== name}
      >
        {content}
      </div>
    );
  const trigger = (name: Tab, label: ReactNode, disabled = false) => (
    <TabsTrigger
      value={name}
      id={`${id}-${name}-tab`}
      role="tab"
      aria-selected={tab === name}
      aria-controls={`${id}-${name}`}
      disabled={disabled}
      title={disabled ? t("used") : undefined}
      className="flex-1 gap-1"
    >
      {label}
    </TabsTrigger>
  );

  return (
    <Tabs value={tab} onValueChange={show} className="space-y-3">
      <TabsList role="tablist" className="flex w-full">
        {trigger("yours", t("yours"))}
        {trigger("contentor", t("contentor"))}
        {trigger(
          "new",
          <>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t("new")}
          </>,
          left <= 0,
        )}
      </TabsList>
      {panel("yours", <YoursPanel onPick={onPick} />)}
      {panel("contentor", <ContentorPanel inUse={inUse} onPick={onPick} />)}
      {/* Always there once opened: a photo being made is not lost by looking at another tab. */}
      {panel(
        "new",
        <NewPanel
          cardAspect={cardAspect}
          left={left}
          onStart={() => setLeft((n) => Math.max(0, n - 1))}
          onUsedUp={() => setLeft(0)}
          onPick={onPick}
          onGenerating={onGenerating}
        />,
      )}
    </Tabs>
  );
}
