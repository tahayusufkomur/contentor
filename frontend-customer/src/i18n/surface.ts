// Which language a request speaks. The creator studio follows the creator;
// everything a visitor sees follows the site.

import { resolveLocale } from "@shared/i18n/locales";

/** The creator's own language, set by the language switcher. */
export const CREATOR_LOCALE_COOKIE = "user-locale";

/** The creator's language from whatever reads cookies (the server's cookie
 *  store, or `document.cookie` in the browser): one place, so the words and
 *  their formats cannot come from different reads. A creator signed in without
 *  the cookie (cleared, or a sign-in path that never set it) speaks the
 *  language on their row, as the backend answers them; `user` is who the
 *  session belongs to, where the caller has them. */
export function creatorLocale(
  read: (name: string) => string | undefined,
  user?: { role?: string; preferred_locale?: string } | null,
) {
  const isCreator = user?.role === "owner" || user?.role === "coach";
  return resolveLocale(
    read(CREATOR_LOCALE_COOKIE) || (isCreator ? user?.preferred_locale : ""),
  );
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
