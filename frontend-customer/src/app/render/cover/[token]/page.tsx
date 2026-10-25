import { notFound } from "next/navigation";
import { CoverArt } from "@/components/covers/cover-art";
import { LookFonts } from "@/components/covers/look-fonts";
import { serverFetch } from "@/lib/api-server";
import { parseLook } from "@/lib/covers/palette";
import { sizeAspect } from "@/lib/covers/recipe";
import type { CoverDesign, CoverItem, CoverSize } from "@/types/design";

export const dynamic = "force-dynamic";

interface RenderPayload {
  design: CoverDesign;
  item: CoverItem;
  size: CoverSize;
}

/** One design drawn alone, the width of the window, in its size's shape: what the browser sidecar
 *  photographs for the studio's Download (backend/apps/media/design_export.py). The token it is opened with
 *  is all it needs: signed by the site, two minutes old at most. */
export default async function RenderCover({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // (the router hands the segment over still encoded: its colons as %3A)
  const data = await serverFetch<RenderPayload>(
    `/api/v1/designs/render/${encodeURIComponent(decodeURIComponent(token))}/`,
  ).catch(() => null);
  if (!data) notFound();
  const aspect = sizeAspect(
    data.size,
    parseLook(data.design.look).style.coverAspect,
  );
  return (
    <>
      <LookFonts look={data.design.look} />
      <div
        data-render-cover=""
        className="relative w-screen"
        style={{ aspectRatio: String(aspect) }}
      >
        <CoverArt
          design={data.design}
          item={data.item}
          size={data.size}
          priority
        />
      </div>
    </>
  );
}
