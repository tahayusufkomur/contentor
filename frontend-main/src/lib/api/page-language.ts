/** The page's language as a request header. On contentor.app a call is answered in the language of the page
 * it came from; the browser's own `Accept-Language` is only the fallback. */
export function languageHeader(): Record<string, string> {
  const lang =
    typeof document === "undefined" ? "" : document.documentElement.lang;
  return lang ? { "Accept-Language": lang } : {};
}
