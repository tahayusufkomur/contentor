"use client";

// The desktop editor's rail: the tools down the left, each opening its drawer. "New photo" is the last one,
// set apart: it opens Photos on its New tab.

import { Fragment, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  Image as ImageIcon,
  LayoutTemplate,
  Palette,
  Shapes,
  Sparkles,
  Type,
  Upload,
} from "lucide-react";
import type { PhotoTab } from "@/components/studio/photo-sources";
import { STUDIO_TOOLS, type StudioTool } from "@/lib/covers/routes";
import { cn } from "@/lib/utils";

/** What the editor shows beside the rail: a drawer, and which tab of the photo sources is on. "New photo"
 *  is not a drawer of its own, it is Photos with its New tab shown. */
export interface ToolState {
  drawer: Exclude<StudioTool, "generate">;
  photosTab: PhotoTab;
}

export const firstTool: ToolState = { drawer: "layouts", photosTab: "yours" };

/** The state after she taps a tool of the rail. */
export function openTool(state: ToolState, tool: StudioTool): ToolState {
  // Photos is where she browses: it leaves the New tab, which has a button of its own.
  if (tool === "photos") {
    return {
      drawer: "photos",
      photosTab: state.photosTab === "new" ? "yours" : state.photosTab,
    };
  }
  if (tool === "generate") return { drawer: "photos", photosTab: "new" };
  return { ...state, drawer: tool };
}

/** The tool of the rail that is lit: "New photo" while the photo sources are on their New tab. */
export const activeTool = (state: ToolState): StudioTool =>
  state.drawer === "photos" && state.photosTab === "new"
    ? "generate"
    : state.drawer;

const ICONS: Record<StudioTool, ComponentType<{ className?: string }>> = {
  layouts: LayoutTemplate,
  photos: ImageIcon,
  text: Type,
  elements: Shapes,
  brand: Palette,
  uploads: Upload,
  generate: Sparkles,
};

export function StudioRail({
  active,
  onOpen,
}: {
  active: StudioTool;
  onOpen: (tool: StudioTool) => void;
}) {
  const t = useTranslations("admin.studio.rail");
  return (
    <nav
      aria-label={t("label")}
      className="flex w-[4.5rem] shrink-0 flex-col items-center gap-0.5 border-r bg-muted px-1 py-2"
    >
      {STUDIO_TOOLS.map((tool) => {
        const Icon = ICONS[tool];
        return (
          <Fragment key={tool}>
            {tool === "generate" && (
              <span aria-hidden="true" className="my-1.5 h-px w-8 bg-border" />
            )}
            <button
              type="button"
              aria-pressed={active === tool}
              onClick={() => onOpen(tool)}
              className={cn(
                "flex w-full flex-col items-center gap-1 rounded-lg px-0.5 py-2 text-center text-[11px] font-medium leading-tight outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
                active === tool
                  ? "bg-background text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              {t(tool)}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
