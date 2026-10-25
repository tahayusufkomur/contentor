import { notFound } from "next/navigation";
import { LookFonts } from "@/components/covers/look-fonts";
import { EndCard } from "@/components/reels/end-card";
import { serverFetch } from "@/lib/api-server";
import type { ReelEndCard } from "@/types/reels";

export const dynamic = "force-dynamic";

/** A reel's end card drawn alone, the width of the window, 9:16: what the browser sidecar photographs for the
 *  video file (backend/apps/reels/render.py). The token it is opened with is all it needs: signed by the
 *  site, two minutes old at most. */
export default async function RenderReelEnd({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // (the router hands the segment over still encoded: its colons as %3A)
  const card = await serverFetch<ReelEndCard>(
    `/api/v1/reels/render/${encodeURIComponent(decodeURIComponent(token))}/`,
  ).catch(() => null);
  if (!card) notFound();
  return (
    <>
      <LookFonts look={card.look} />
      <div data-render-reel="" className="relative aspect-[9/16] w-screen">
        <EndCard card={card} />
      </div>
    </>
  );
}
