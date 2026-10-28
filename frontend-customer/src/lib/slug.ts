/** A brand name as the site's address slug, the way the server makes it
 * (Django's slugify, cut at 63): accents dropped, anything but letters,
 * digits, "_" and "-" removed, spaces and runs of "-" as one "-". */
export function siteSlug(brand: string): string {
  return brand
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 63);
}
