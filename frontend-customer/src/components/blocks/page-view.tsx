import { getAuthUser } from "@/lib/auth";
import { PageRenderer } from "./page-renderer";
import { EditModeCanvas } from "@/components/owner/canvas/edit-mode-canvas";
import type { Block, PageKey } from "@/types/tenant";
import type { DynamicData } from "@/lib/blocks/fetch-dynamic-data";

interface PageViewProps {
  pageKey: PageKey;
  blocks: Block[];
  dynamicData?: DynamicData;
  pageTitle?: string;
}

/** Renders a builder page. Coaches/owners get the live drag-and-drop
 *  `EditModeCanvas` (which reads blocks from the editor store); everyone else
 *  gets the static, server-rendered `PageRenderer` — byte-identical to before,
 *  so the public site + SEO are untouched. */
export async function PageView({
  pageKey,
  blocks,
  dynamicData,
  pageTitle,
}: PageViewProps) {
  const user = await getAuthUser();
  const isAdmin = user?.role === "owner" || user?.role === "coach";

  if (isAdmin) {
    return <EditModeCanvas pageKey={pageKey} blocks={blocks} dynamicData={dynamicData} />;
  }
  return (
    <PageRenderer
      blocks={blocks}
      dynamicData={dynamicData}
      pageTitle={pageTitle}
    />
  );
}
