import { createTranslator } from "next-intl";
import blocksEn from "../../../messages/en/blocks.json";

// The block library speaks in two languages. What the creator reads while she
// builds (block, field and template names) is `admin.owner.blockLib` in HER
// language. What a new block or a built-in template writes onto the site is
// `blocks` in the SITE's language, written once: after that it is her text.
// Each is handed to the library as a `Say`.

export interface Say {
  (key: string, values?: Record<string, string | number>): string;
  /** A message's raw value: an object or list when the key names a group. */
  raw(key: string): unknown;
  has(key: string): boolean;
}

/** A next-intl translator of any namespace, loosely typed (see i18n/dynamic.ts). */
export type Translator = {
  (key: never, values?: never): string;
  raw(key: never): unknown;
  has(key: never): boolean;
};

export function say(t: Translator): Say {
  return Object.assign(
    (key: string, values?: Record<string, string | number>) =>
      t(key as never, values as never),
    {
      raw: (key: string) => t.raw(key as never),
      has: (key: string) => t.has(key as never),
    },
  );
}

/** No words at all: keys come back as keys. For code that needs a block's
 *  component, dataset or icon and never shows its name. */
export const NO_WORDS: Say = Object.assign((key: string) => key, {
  raw: (key: string) => key,
  has: () => false,
});

/** The block library's site content in English: the source copy, for callers
 *  with no translator at hand (tests, the static registry). */
export const ENGLISH_CONTENT: Say = say(
  createTranslator({
    locale: "en",
    messages: { blocks: blocksEn },
    namespace: "blocks",
  }) as unknown as Translator,
);

/** `home-classic` / `face_yoga` as the camelCase key segment `homeClassic` / `faceYoga`. */
export const camel = (id: string) =>
  id.replace(/[-_]+([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

/** A manifest label as the key segment its translation lives under:
 *  "Small line (e.g. location or format)" -> `smallLineEgLocationOrFormat`. */
export const slug = (text: string) =>
  text
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toLowerCase() + w.slice(1)
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join("");

/** Plain text as the HTML of a rich-text field (a paragraph is added by the caller). */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
