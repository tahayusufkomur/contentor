import { BlockRenderer } from "./block-renderer";
import { pageWrapperClass } from "@/lib/blocks/section-defs";
import type { Block } from "@/types/tenant";
import type { DynamicData } from "@/lib/blocks/fetch-dynamic-data";

interface PageRendererProps {
  blocks: Block[];
  dynamicData?: DynamicData;
  /** Accessible page title — rendered as a visually-hidden h1 when no hero. */
  pageTitle?: string;
  /** Site style id, for AI-built sections. */
  styleId?: string;
}

export function PageRenderer({
  blocks,
  dynamicData,
  pageTitle,
  styleId,
}: PageRendererProps) {
  const visible = blocks.filter((b) => b.enabled !== false);
  const firstIsHero =
    visible[0]?.type === "hero" || visible[0]?.type === "section.hero";

  // Break out of the layout's px-4/py-8 container so sections are full-bleed.
  return (
    <div className={pageWrapperClass(visible)}>
      {pageTitle && !firstIsHero && <h1 className="sr-only">{pageTitle}</h1>}
      {visible.length === 0 ? (
        <div className="px-4 py-24 text-center text-sm text-muted-foreground">
          This page has no content yet.
        </div>
      ) : (
        blocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            dynamicData={dynamicData}
            styleId={styleId}
          />
        ))
      )}
    </div>
  );
}
