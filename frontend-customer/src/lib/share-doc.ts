import { ApiError } from "@/types/api";

/** A bio, CV or old About page the coach shares in /setup: a file or pasted text. */
export interface ShareDoc {
  file?: File;
  text?: string;
}

export const SHARE_ACCEPT = ".pdf,.txt,.md";
export const SHARE_MAX_BYTES = 5 * 1024 * 1024;
/** The questions that offer it: the opening one, the story and the training. */
export const SHARE_FIELDS = ["teaches", "story", "credentials"];

/** Why a picked file can't be sent, in the coach's words (null: fine). The
 * server checks again; this only saves a round trip. */
export function fileProblem(file: {
  name: string;
  size: number;
}): string | null {
  if (!/\.(pdf|txt|md)$/i.test(file.name))
    return "I can read PDF, text and Markdown files. Try one of those, or paste the text instead.";
  if (file.size > SHARE_MAX_BYTES)
    return "That file is too big. Keep it under 5 MB, or paste the text instead.";
  return null;
}

/** A refused or failed share, in the coach's words. */
export function shareErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400 && typeof err.data.detail === "string")
      return err.data.detail;
    if (err.status === 503)
      return "I couldn’t read it just now. Try again in a minute.";
    if (err.status === 409)
      return "Setup has finished, so I can’t add this any more.";
  }
  return "That didn’t go through. Try again in a moment.";
}
