// Which language a request speaks. The creator studio follows the creator;
// everything a visitor sees follows the site.

import { resolveLocale } from "@shared/i18n/locales";

/** The creator's own language, set by the language switcher. */
export const CREATOR_LOCALE_COOKIE = "user-locale";

/** The creator's language from whatever reads cookies (the server's cookie
 *  store, or `document.cookie` in the browser): one place, so the words and
 *  their formats cannot come from different reads. */
export function creatorLocale(read: (name: string) => string | undefined) {
  return resolveLocale(read(CREATOR_LOCALE_COOKIE));
}

export type Surface = "studio" | "site+owner" | "site";

export function surfaceOf(
  pathname: string,
  embed: string | null,
  role?: string,
): Surface {
  if (/^\/(admin|setup)(\/|$)/.test(pathname)) return "studio";
  // The owner tools render on the public site; the setup preview frame
  // (?embed=1) is the plain site.
  if ((role === "owner" || role === "coach") && (!embed || embed === "edit"))
    return "site+owner";
  return "site";
}

export function namespacesFor(surface: Surface): {
  creator: string[];
  site: string[];
} {
  const site = ["site", "student", "pwa"];
  // `blocks` is what the owner tools write onto the site (new blocks, templates):
  // the site's language, and only where the owner tools are, not on every page.
  if (surface === "studio")
    return {
      creator: ["common", "admin", "studio"],
      site: [...site, "blocks"],
    };
  if (surface === "site+owner")
    return {
      creator: ["admin", "studio"],
      site: ["common", ...site, "blocks"],
    };
  return { creator: [], site: ["common", ...site] };
}
