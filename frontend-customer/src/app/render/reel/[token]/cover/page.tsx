import { notFound } from "next/navigation";
import { CoverFonts, ReelCover } from "@/components/reels/reel-cover";
import { serverFetch } from "@/lib/api-server";
import type { CoverBrand, ReelCoverCard } from "@/types/reels";

export const dynamic = "force-dynamic";

/** A reel's cover drawn alone, the width of the window, 9:16: what the browser sidecar photographs for the
 *  video's first second and the cover picture (backend/apps/reels/render.py). The token it is opened with is
 *  all it needs: signed by the site, two minutes old at most. */
export default async function RenderReelCover({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // (the router hands the segment over still encoded: its colons as %3A)
  const cover = await serverFetch<ReelCoverCard & CoverBrand>(
    `/api/v1/reels/render/${encodeURIComponent(decodeURIComponent(token))}/cover/`,
  ).catch(() => null);
  if (!cover) notFound();
  return (
    <>
      <CoverFonts look={cover.look} />
      <div data-render-reel="" className="w-screen">
        <ReelCover cover={cover} brand={cover} />
      </div>
    </>
  );
}
