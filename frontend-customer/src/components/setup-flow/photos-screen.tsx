"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { clientFetch } from "@/lib/api-client";
import type { QuestionStep } from "@/lib/interview";
import {
  coverage,
  isSmall,
  OWN_PHOTO_ACCEPT,
  ownPhotosAnswer,
  photoProblem,
  shapeOf,
  statusLine,
  STOCK_ANSWER,
  tally,
} from "@/lib/own-photos";
import type {
  OwnPhoto,
  PhotoCards,
  PhotoShot,
  TurnRequest,
} from "@/lib/setup-flow";
import { UploadCancelled, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";
import type { Photo } from "@/types/photo";
import { QuestionHelp } from "./question-help";

/** A photo on this screen: one she added before, or one on its way up. */
interface Item extends Omit<OwnPhoto, "id"> {
  /** Stable for the list; the photo's id once it has one. */
  key: string;
  id?: string;
  percent?: number;
  problem?: string;
}

const AT_ONCE = 3;
const fromServer = (p: OwnPhoto): Item => ({ ...p, key: p.id });

/** The photos question, on the whole screen: what kind of photos the site
 * uses and how many, a place to drop them, and each one's way up. She
 * continues with her own photos, or leaves the photos to the guide. Each
 * photo is made web-ready and described after it lands, without her waiting. */
export function PhotosScreen({
  step,
  cards,
  live,
  sending,
  onSend,
  onNext,
  dir,
}: {
  step: QuestionStep;
  cards: PhotoCards;
  /** The question being asked now, vs. one the coach went back to. */
  live: boolean;
  sending: boolean;
  onSend: (req: TurnRequest) => void;
  /** Move on without answering again. */
  onNext: () => void;
  dir: "next" | "back";
}) {
  const [items, setItems] = useState<Item[]>(() =>
    cards.photos.map(fromServer),
  );
  const [over, setOver] = useState(false);
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Uploads still running when she leaves the screen stop with it.
  const stop = useRef<AbortController | null>(null);
  const queue = useRef<{ key: string; file: File }[]>([]);
  const running = useRef(0);
  useEffect(() => {
    stop.current = new AbortController();
    return () => stop.current?.abort();
  }, []);

  const patch = (key: string, change: Partial<Item>) =>
    setItems((all) =>
      all.map((i) => (i.key === key ? { ...i, ...change } : i)),
    );

  const pump = () => {
    while (running.current < AT_ONCE && queue.current.length) {
      const { key, file } = queue.current.shift()!;
      running.current += 1;
      uploadPhoto(file, {
        signal: stop.current!.signal,
        onProgress: (percent) => patch(key, { percent }),
      })
        .then((photo: Photo) =>
          patch(key, {
            id: photo.id,
            status: photo.index_status || "pending",
            width: photo.width,
            height: photo.height,
            percent: undefined,
          }),
        )
        .catch((err) => {
          if (err instanceof UploadCancelled) return;
          patch(key, {
            status: "error",
            percent: undefined,
            problem: "It didn’t upload. Remove it and add it again.",
          });
        })
        .finally(() => {
          running.current -= 1;
          pump();
        });
    }
  };

  const add = (files: File[]) => {
    const room = cards.max - items.length;
    if (room <= 0) {
      setNote(`That is the most I can take here: ${cards.max} photos.`);
      return;
    }
    const taken: Item[] = [];
    const problems: string[] = [];
    for (const file of files.slice(0, room)) {
      const problem = photoProblem(file);
      if (problem) {
        problems.push(`${file.name}: ${problem}`);
        continue;
      }
      const key = `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`;
      taken.push({
        key,
        url: URL.createObjectURL(file),
        title: file.name,
        width: null,
        height: null,
        status: "uploading",
        percent: 0,
      });
      queue.current.push({ key, file });
    }
    if (files.length > room)
      problems.push(
        `Only the first ${room} were added: ${cards.max} photos is the most I can take here.`,
      );
    setNote(problems.join(" "));
    if (taken.length) {
      setItems((all) => [...all, ...taken]);
      pump();
    }
  };

  const remove = (item: Item) => {
    setItems((all) => all.filter((i) => i.key !== item.key));
    queue.current = queue.current.filter((q) => q.key !== item.key);
    if (item.id)
      clientFetch(`/api/v1/photos/${item.id}/`, { method: "DELETE" }).catch(
        () =>
          toast.error("That photo couldn’t be removed. Try again from Media."),
      );
  };

  // A photo is made web-ready within seconds of landing: follow it until
  // it is, so its size (and so its shape) is the real one.
  const settling = items.some((i) => i.id && i.status === "pending");
  useEffect(() => {
    if (!settling) return;
    const timer = setInterval(async () => {
      const fresh = await clientFetch<{ results: Photo[] }>(
        "/api/v1/photos/?own=1&limit=100",
      ).catch(() => null);
      if (!fresh) return;
      const byId = new Map(fresh.results.map((p) => [p.id, p]));
      setItems((all) =>
        all.map((i) => {
          const now = i.id ? byId.get(i.id) : undefined;
          return now
            ? {
                ...i,
                status: now.index_status || i.status,
                width: now.width ?? i.width,
                height: now.height ?? i.height,
              }
            : i;
        }),
      );
    }, 4000);
    return () => clearInterval(timer);
  }, [settling]);

  const added = items.filter((i) => i.id);
  const uploading = items.some((i) => i.status === "uploading");
  const counts = tally(items);
  const send = (req: TurnRequest) => {
    if (sending) return;
    onSend(live || !step.field ? req : { ...req, field: step.field });
  };
  const field = step.field ?? "photos";
  const words = step.question.split(/\s+/).filter(Boolean);
  const answersAt = 160 + Math.min(words.length, 16) * 42;
  // Going back to it with nothing changed just moves on.
  const unchanged =
    !live &&
    !!step.answer &&
    added.length === cards.photos.length &&
    added.every((i) => cards.photos.some((p) => p.id === i.id));

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-5 py-8 sm:px-10">
        <div
          className={
            dir === "back"
              ? "motion-safe:animate-[sf-slide-back_.6s_var(--sf-spring)_.1s_both]"
              : "motion-safe:animate-[sf-slide-next_.6s_var(--sf-spring)_.1s_both]"
          }
        >
          {live && step.ack && (
            <p className="max-w-[72ch] text-[16px] leading-relaxed text-[var(--sf-graphite)] motion-safe:animate-[sf-rise_.5s_ease-out_both]">
              {step.ack}
            </p>
          )}
          {!live && step.answer && (
            <p className="max-w-[72ch] text-[15px] text-[var(--sf-graphite)]">
              You said:{" "}
              <span className="text-[var(--sf-ink)]">{step.answer}</span>
            </p>
          )}
          <h1 className="mt-3 max-w-[32ch] text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[42px]">
            {words.map((w, i) => (
              <Fragment key={i}>
                <span
                  className="inline-block motion-safe:animate-[sf-word_.8s_var(--sf-spring)_both]"
                  style={{ animationDelay: `${120 + Math.min(i, 16) * 42}ms` }}
                >
                  {w}
                </span>{" "}
              </Fragment>
            ))}
          </h1>
          {step.why && (
            <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--sf-graphite)]">
              {step.why}
            </p>
          )}
          <QuestionHelp help={step.help} />

          <div
            className="mt-8 grid gap-8 motion-safe:animate-[sf-rise_.6s_ease-out_both] lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-12"
            style={{ animationDelay: `${answersAt}ms` }}
          >
            <div className="min-w-0">
              <input
                ref={input}
                id="setup-photos-input"
                type="file"
                multiple
                accept={OWN_PHOTO_ACCEPT}
                aria-label="Add photos"
                disabled={sending}
                className="sr-only"
                onChange={(e) => {
                  add(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={sending}
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  add(Array.from(e.dataTransfer.files));
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-[background-color,border-color] duration-200 disabled:pointer-events-none disabled:opacity-55",
                  over
                    ? "border-[var(--sf-ink)] bg-[var(--sf-tint-strong)]"
                    : "border-[var(--sf-line-strong)] bg-white hover:border-[var(--sf-ink)]",
                )}
              >
                <ImagePlus
                  aria-hidden
                  className="size-7 text-[var(--sf-brass)]"
                />
                <span className="text-[16.5px] font-semibold">
                  {items.length ? "Add more photos" : "Add your photos"}
                </span>
                <span className="max-w-[46ch] text-[13.5px] leading-relaxed text-[var(--sf-graphite)]">
                  Drop them here or choose them. JPG, PNG, WebP or AVIF, up to
                  25 MB each. I make every photo light enough for the web, so
                  bring the full-size ones.
                </span>
              </button>
              {note && (
                <p
                  role="alert"
                  className="mt-3 text-[13.5px] leading-relaxed text-destructive"
                >
                  {note}
                </p>
              )}

              {items.length > 0 && (
                <ul
                  aria-label="Your photos"
                  className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3"
                >
                  {items.map((item) => (
                    <li key={item.key} className="min-w-0">
                      <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--sf-line)] bg-[var(--sf-tint-strong)]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or a signed storage URL */}
                        <img
                          src={item.url}
                          alt={item.title}
                          className={cn(
                            "size-full object-cover",
                            item.status === "uploading" && "opacity-55",
                          )}
                        />
                        {item.status === "uploading" && (
                          <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/70">
                            <span
                              className="block h-full bg-[var(--sf-ink)] transition-[width] duration-200"
                              style={{ width: `${item.percent ?? 0}%` }}
                            />
                          </span>
                        )}
                        {item.status === "pending" && (
                          <span className="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-white/90">
                            <Spinner
                              size="sm"
                              className="text-[var(--sf-brass)]"
                            />
                          </span>
                        )}
                        {item.id && item.status !== "pending" && (
                          <span className="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-[var(--sf-ink)] text-[var(--sf-paper)]">
                            <Check
                              aria-hidden
                              className="size-3.5"
                              strokeWidth={3}
                            />
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${item.title}`}
                          disabled={sending}
                          onClick={() => remove(item)}
                          className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-white/90 text-[var(--sf-ink)] transition-colors hover:bg-white disabled:opacity-50"
                        >
                          <X aria-hidden className="size-4" />
                        </button>
                      </div>
                      <p
                        className={cn(
                          "mt-1.5 truncate text-[12.5px] leading-snug",
                          item.status === "error"
                            ? "text-destructive"
                            : "text-[var(--sf-graphite)]",
                        )}
                      >
                        {item.problem ??
                          (isSmall(item.width, item.height)
                            ? "Small: soft when shown large"
                            : statusLine(item.status))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-7 flex min-h-11 flex-wrap items-center gap-2">
                {sending ? (
                  <p className="flex items-center gap-2 text-[15px] text-[var(--sf-graphite)]">
                    <Spinner size="sm" className="text-[var(--sf-brass)]" />
                    Thinking…
                  </p>
                ) : (
                  <>
                    <Button
                      id="setup-continue"
                      size="lg"
                      disabled={uploading || added.length === 0}
                      onClick={() =>
                        unchanged
                          ? onNext()
                          : send({
                              message: ownPhotosAnswer(added.length),
                              choice: { field, value: "own" },
                            })
                      }
                      className="rounded-full px-6"
                    >
                      {uploading
                        ? "Uploading…"
                        : added.length === 0
                          ? "Add a photo to continue"
                          : unchanged
                            ? "Keep these photos"
                            : added.length === 1
                              ? "Continue with my photo"
                              : `Continue with my ${added.length} photos`}
                    </Button>
                    <Button
                      variant="ghost"
                      size="lg"
                      disabled={uploading}
                      onClick={() =>
                        send({
                          message: STOCK_ANSWER,
                          choice: { field, value: "stock" },
                        })
                      }
                      className="rounded-full text-[var(--sf-graphite)]"
                    >
                      {STOCK_ANSWER}
                    </Button>
                  </>
                )}
              </div>
              <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-[var(--sf-faint)]">
                Your photos stay yours and are only used on your site. You can
                add, swap or remove them any time under Media.
              </p>
            </div>

            <aside
              aria-label="What to bring"
              className="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-paper)] p-5"
            >
              <h2 className="text-[15px] font-semibold">What to bring</h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--sf-graphite)]">
                10 to 20 photos cover a whole site. Fewer is fine: I fill the
                rest with photos that fit what you do.
              </p>
              <ul className="mt-4 flex flex-col gap-4">
                {cards.guide.map((shot) => (
                  <ShotRow
                    key={shot.shape}
                    shot={shot}
                    have={counts[shot.shape]}
                  />
                ))}
              </ul>
              <p className="mt-4 border-t border-[var(--sf-line)] pt-3 text-[13px] leading-relaxed text-[var(--sf-graphite)]">
                Sharp and at least 1600 px on the long side. Keep faces and
                hands away from the edges: each section crops a photo to its own
                shape.
              </p>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

const FRAMES: Record<PhotoShot["shape"], string> = {
  portrait: "h-11 w-9",
  landscape: "h-7 w-12",
  square: "size-9",
};

function ShotRow({ shot, have }: { shot: PhotoShot; have: number }) {
  const enough = have > 0 && have >= shot.count;
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden
        className="flex w-12 shrink-0 items-start justify-center pt-0.5"
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-[5px] border-2",
            FRAMES[shot.shape],
            have
              ? "border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)]"
              : "border-[var(--sf-line-strong)]",
          )}
        >
          {enough && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </span>
      <div className="min-w-0">
        <p className="text-[14.5px] font-semibold leading-snug">
          {shot.label}{" "}
          <span className="font-normal text-[var(--sf-graphite)]">
            {shot.aspect}
          </span>
        </p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-[var(--sf-graphite)]">
          {shot.use}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-[var(--sf-faint)]">
          {shot.shoot}
        </p>
        <p className="mt-1 text-[12.5px] font-medium text-[var(--sf-ink)]">
          {coverage(have, shot.count)}
        </p>
      </div>
    </li>
  );
}
