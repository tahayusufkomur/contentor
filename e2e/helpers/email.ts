export async function latestEmail(to: string): Promise<{ subject: string; html: string }> {
  const url = `http://localhost/api/v1/dev/emails/latest/?to=${encodeURIComponent(to)}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as { subject: string; html: string };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no sink email for ${to} within 15s`);
}

export function firstLink(html: string): string {
  const m = html.match(/href="([^"]+)"/);
  if (!m) throw new Error("no link in email html");
  return m[1].replace(/&amp;/g, "&");
}
