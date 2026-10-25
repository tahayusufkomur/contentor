// Edits of one of her photos (backend/apps/media/photo_edits.py): its background removed, or the photo
// extended, cleaned up or changed by the image model. Each makes a new photo in her Media and leaves the
// original as it is. They run as jobs, followed with `photoJobStatus` (followJob in lib/covers/generate.ts).
import { clientFetch } from "@/lib/api-client";
import type { MaterializedPhoto } from "@/lib/curated-photos-api";

export interface PhotoEditJob {
  job_id: string;
  done: boolean;
  /** Her new photo, once the job is fulfilled; null while it runs, or when it failed. */
  photo: MaterializedPhoto | null;
}

/** "expand" grows the photo to `aspect` (width over height); "erase" takes away what `instruction` names;
 *  "change" changes what it says. */
export type PhotoEdit =
  | { mode: "expand"; aspect: number }
  | { mode: "erase" | "change"; instruction: string };

/** Her figure (or whatever the photo is of) cut out of its background: free, about twenty seconds. */
export function startCutout(photoId: string): Promise<PhotoEditJob> {
  return clientFetch<PhotoEditJob>(`/api/v1/photos/${photoId}/cutout/`, {
    method: "POST",
  });
}

/** One edit by the image model. It counts against the month's new photos: 429 when they are used up. */
export function startPhotoEdit(
  photoId: string,
  edit: PhotoEdit,
): Promise<PhotoEditJob> {
  return clientFetch<PhotoEditJob>(`/api/v1/photos/${photoId}/edit/`, {
    method: "POST",
    body: JSON.stringify(edit),
  });
}

export function photoJobStatus(jobId: string): Promise<PhotoEditJob> {
  return clientFetch<PhotoEditJob>(
    `/api/v1/photos/jobs/${encodeURIComponent(jobId)}/`,
  );
}

/** The colours of a photo, most of it first, as #rrggbb. */
export function photoColours(photoId: string): Promise<{ colours: string[] }> {
  return clientFetch<{ colours: string[] }>(
    `/api/v1/photos/${photoId}/colours/`,
  );
}
