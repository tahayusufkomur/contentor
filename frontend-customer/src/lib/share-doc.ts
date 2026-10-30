import type { T } from "@/lib/setup-flow";
import { ApiError } from "@/types/api";

/** A bio, CV or old About page shared on /setup's first screen: a file or pasted text. */
export interface ShareDoc {
  file?: File;
  text?: string;
}

export const SHARE_ACCEPT = ".pdf,.txt,.md";
export const SHARE_MAX_BYTES = 5 * 1024 * 1024;

/** Why a picked file can't be sent, in the coach's words (null: fine). The
 * server checks again; this only saves a round trip. */
export function fileProblem(
  file: { name: string; size: number },
  t: T,
): string | null {
  if (!/\.(pdf|txt|md)$/i.test(file.name)) return t("share.fileType");
  if (file.size > SHARE_MAX_BYTES) return t("share.fileSize");
  return null;
}

/** A refused or failed share, in the coach's words. */
export function shareErrorText(err: unknown, t: T): string {
  if (err instanceof ApiError) {
    if (err.status === 400 && typeof err.data.detail === "string")
      return err.data.detail;
    if (err.status === 503) return t("share.unavailable");
    if (err.status === 409) return t("share.finished");
  }
  return t("share.other");
}
