import { parseLook } from "@/lib/covers/palette";
import { styleFontsHref } from "@/lib/site-styles";

/** The look's Google Fonts, for screens where the tenant theme is off (`/admin`) and the site's own
 *  link is not there. `look` is a cover payload's `"<style id>"` or `"<style id>:<palette id>"`. */
export function LookFonts({ look }: { look: string }) {
  return <link rel="stylesheet" href={styleFontsHref(parseLook(look).style)} />;
}
