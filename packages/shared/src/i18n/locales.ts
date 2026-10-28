// The locale list, shared by both Next apps. The list itself is locales.json
// (also synced to Django); ENABLED_LOCALES decides which of them the public sees.
import data from "./locales.json";

export const DEFAULT_LOCALE = data.default;
export const LOCALES: readonly string[] = data.locales.map((l) => l.code);

/** Enabled languages, `en` first, unknown codes dropped. Read at call time. */
export function enabledLocales(): string[] {
  const asked = (process.env.NEXT_PUBLIC_ENABLED_LOCALES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => LOCALES.includes(c) && c !== DEFAULT_LOCALE);
  return [DEFAULT_LOCALE, ...new Set(asked)];
}

/** A language the public may see, else English. */
export function resolveLocale(value?: string | null): string {
  return value && enabledLocales().includes(value) ? value : DEFAULT_LOCALE;
}

export function nativeName(code: string): string {
  return data.locales.find((l) => l.code === code)?.native ?? code;
}

export function ogLocale(code: string): string {
  return (data.locales.find((l) => l.code === code) ?? data.locales[0]).og;
}

type Messages = Record<string, unknown>;
const isObj = (v: unknown): v is Messages =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The English file with the language's file laid over it, key by key. */
export function mergeMessages(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = isObj(b) && isObj(v) ? mergeMessages(b, v) : v;
  }
  return out;
}

const warned = new Set<string>();
/** next-intl's `getMessageFallback`: the English text, logged once per key. */
export function missingFallback(
  locale: string,
  english: Messages,
  { namespace, key }: { namespace?: string; key: string },
): string {
  const path = [namespace, key].filter(Boolean).join(".");
  const id = `${locale} ${path}`;
  if (!warned.has(id)) {
    warned.add(id);
    console.warn(`i18n: missing ${id}`);
  }
  let cur: unknown = english;
  for (const part of path.split(".")) cur = isObj(cur) ? cur[part] : undefined;
  return typeof cur === "string" ? cur : path;
}
