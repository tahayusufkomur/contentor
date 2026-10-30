// Which language a request speaks. The creator studio follows the creator;
// everything a visitor sees follows the site.

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
