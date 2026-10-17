import { fetchSiteIndex, llmsTxt } from "@/lib/site-index";

export const dynamic = "force-dynamic";

export async function GET() {
  const site = await fetchSiteIndex();
  if (!site) return new Response("Not found\n", { status: 404 });
  return new Response(llmsTxt(site), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
