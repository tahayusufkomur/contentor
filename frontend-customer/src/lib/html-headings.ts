// Pull the coach-visible <h2> texts out of sanitized body_html so the inline
// image manager can offer heading anchors. Regex is fine here: body_html is
// server-sanitized (nh3) and h2s never nest.
export function parseH2Headings(html: string): string[] {
  if (!html) return [];
  const decode = (s: string) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]*>/g, "")).trim())
    .filter(Boolean);
}
