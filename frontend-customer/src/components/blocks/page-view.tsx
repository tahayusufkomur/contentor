import { getAuthUser } from "@/lib/auth";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
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
  const [user, config] = await Promise.all([
    getAuthUser(),
    getTenantSlug().then(fetchTenantConfig),
  ]);
  // AI-built sections (cx) render with the site style's kit.
  const styleId = config?.style ?? "";
  const isAdmin = user?.role === "owner" || user?.role === "coach";

  if (isAdmin) {
    return (
      <EditModeCanvas
        pageKey={pageKey}
        blocks={blocks}
        dynamicData={dynamicData}
        styleId={styleId}
      />
    );
  }
  return (
    <PageRenderer
      blocks={blocks}
      dynamicData={dynamicData}
      pageTitle={pageTitle}
      styleId={styleId}
    />
  );
}
