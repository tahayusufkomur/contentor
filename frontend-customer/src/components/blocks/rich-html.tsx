import { cn } from "@/lib/utils";

// Light prose styling for the small allowlist of rich-text tags (lists, links,
// paragraphs). Applied to the container so raw HTML renders sensibly.
const PROSE =
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:underline [&_a]:underline-offset-2 [&_p]:mb-3 [&_p:last-child]:mb-0";

function hasHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/** Renders a rich-text body value. HTML (produced by the rich editor and
 *  sanitised server-side) renders via dangerouslySetInnerHTML; legacy plain
 *  text renders with line breaks preserved. */
export function RichHtml({
  html,
  className,
}: {
  html?: string;
  className?: string;
}) {
  if (!html) return null;
  if (hasHtml(html)) {
    return (
      <div
        className={cn(PROSE, className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <div className={cn("whitespace-pre-wrap", className)}>{html}</div>;
}
