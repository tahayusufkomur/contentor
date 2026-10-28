/** A brand name as the site's address slug, the way the server makes it
 * (apps.core.slugs.slugify, cut at 63): ı ł ß written as i l ss, accents
 * folded, anything but letters, digits, "_" and "-" removed, spaces and runs
 * of "-" as one "-". */
const UNFOLDABLE: Record<string, string> = { ı: "i", ł: "l", Ł: "l", ß: "ss" };

export function siteSlug(brand: string): string {
  return brand
    .replace(/[ıłŁß]/g, (c) => UNFOLDABLE[c])
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[-\s]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 63);
}
