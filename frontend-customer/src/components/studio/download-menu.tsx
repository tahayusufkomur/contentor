"use client";

// Download: the design as an image file, at any of its sizes, for a post, a story, a thumbnail or her own
// use elsewhere. The server draws what is saved (backend/apps/media/design_export.py), so the last edits are
// saved first.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Download } from "lucide-react";
import { shapeLabel } from "@/components/studio/size-previews";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadDesign } from "@/lib/designs-api";
import { ALL_SIZES } from "@/types/design";
import type { CoverSize } from "@/types/design";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import type { CoverAspect } from "@shared/sections/types";

export function DownloadMenu({
  designId,
  cardAspect,
  save,
  disabled,
  className,
  compact = false,
}: {
  designId: string;
  cardAspect: CoverAspect;
  /** Saves the last edits: the file is drawn from what is saved. */
  save: () => Promise<void>;
  disabled?: boolean;
  className?: string;
  /** An icon alone (a phone's header, beside Undo), its name read out and shown on hover. */
  compact?: boolean;
}) {
  const t = useTranslations("admin.studio.download");
  const ts = useTranslations("admin.studio.size");
  const [jpeg, setJpeg] = useState(false);
  const { run, loading } = useAsyncAction(
    async (size: CoverSize) => {
      await save();
      await downloadDesign(designId, size, jpeg ? "jpeg" : "png");
    },
    { errorToast: t("failed") },
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("label")}
            title={t("label")}
            loading={loading}
            disabled={disabled}
          >
            <Download />
          </Button>
        ) : (
          <Button
            variant="outline"
            className={className}
            loading={loading}
            loadingText={t("making")}
            disabled={disabled}
          >
            <Download />
            {t("label")}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {ALL_SIZES.map((size) => (
          <DropdownMenuItem
            key={size}
            onSelect={() => void run(size)}
            className="flex items-baseline gap-2"
          >
            <span className="font-medium">{ts(size)}</span>
            <span className="text-xs text-muted-foreground">
              {shapeLabel(size, cardAspect)}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {t(`for.${size}`)}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* a choice that stays open: it changes the file the sizes above make */}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            setJpeg((on) => !on);
          }}
          className="gap-2 text-xs"
        >
          <Check
            aria-hidden="true"
            className={jpeg ? "size-3.5" : "size-3.5 opacity-0"}
          />
          {t("jpeg")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
