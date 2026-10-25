// Making one new photo for a cover: the "New" tab of the photo sources, and the photo edits of the Edit photo
// drawer (a background removed, a photo extended or changed). Each takes from seconds to a minute, so the job
// is started and then followed (curated-images-api.ts, photo-edits-api.ts).

import { retryTransient } from "@/lib/api-client";
import { generationStatus, startGeneration } from "@/lib/curated-images-api";
import type { MaterializedPhoto } from "@/lib/curated-photos-api";
import type { GenerationAspect } from "./recipe";

/** A job as the server reports it: done, and her photo once it is fulfilled. */
export interface PhotoJob {
  job_id: string;
  done: boolean;
  photo: MaterializedPhoto | null;
}

/** Between status calls. The server already holds each call about 8 s, so this only spaces them out. */
export const POLL_MS = 2000;
/** A photo takes about a minute: five is a job that is not going to finish. */
const GIVE_UP_MS = 5 * 60_000;

/** Resolves after `ms`, or rejects with the signal's reason the moment it aborts (at once, if it has
 *  already: an abort event is not sent twice, so a listener added now would never hear it). */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const stop = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** Starts a new photo and follows it to the end. Resolves with her photo, or null when the job ended without
 *  one. Rejects when the job cannot be started (429: this month's photos are used up), when it takes too long,
 *  and with the signal's reason when `signal` aborts, whenever that happens: while the job is being started,
 *  while a status call is on its way (a long poll, so that is most of the time), or while one waits to be
 *  retried. After an abort nothing more is asked and no photo is returned, even one the call in flight
 *  brings. `onStart` runs once the job is on its way, which is when it counts against the month. */
export function makePhoto(
  prompt: string,
  aspect: GenerationAspect,
  options: { signal?: AbortSignal; onStart?: () => void } = {},
): Promise<MaterializedPhoto | null> {
  return followJob(
    () => startGeneration(prompt, aspect),
    generationStatus,
    options,
  );
}

/** Starts a photo job with `start` and follows it with `status` to the end: makePhoto's rules (see there) for
 *  any job that ends in one of her photos. */
export async function followJob(
  start: () => Promise<PhotoJob>,
  status: (jobId: string) => Promise<PhotoJob>,
  { signal, onStart }: { signal?: AbortSignal; onStart?: () => void } = {},
): Promise<MaterializedPhoto | null> {
  // A job may be one of this month's photos: none is started for someone who has already gone.
  signal?.throwIfAborted();
  let job = await start();
  // It is on its way, and counts, whether or not she is still there.
  onStart?.();
  signal?.throwIfAborted();
  const giveUpAt = Date.now() + GIVE_UP_MS;
  while (!job.done) {
    await wait(POLL_MS, signal);
    if (Date.now() > giveUpAt) throw new Error("The photo took too long");
    // A blip in the connection must not lose a photo that is already paid for. The check sits inside
    // the attempt, and an abort is not a blip, so a retry is never made for someone who has gone.
    job = await retryTransient(
      () => {
        signal?.throwIfAborted();
        return status(job.job_id);
      },
      { retries: 2 },
    );
    // She has often left while the call was on its way: its answer is not for her any more.
    signal?.throwIfAborted();
  }
  return job.photo;
}
