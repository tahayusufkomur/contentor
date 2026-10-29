"use client";

import { useTranslations } from "next-intl";
import { Wand2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AiBadge } from "@/components/admin/feature-badges";
import { LogoUploader } from "@/components/owner/logo-uploader";
import { LogoStudio } from "@/components/logo/logo-studio";
import { LookPicker } from "@/components/owner/look-picker";
import type { TenantConfig } from "@/types/tenant";

interface BrandTabProps {
  config: TenantConfig;
  onChange: (patch: Partial<TenantConfig>) => void;
  /** Logo Studio open state — owned by EditSidebar so `?studio=1` can open it. */
  studioOpen: boolean;
  onStudioOpenChange: (open: boolean) => void;
  /** Wears another look — EditSidebar saves pending edits first. */
  onApplyLook: (look: string) => Promise<void>;
}

export function BrandTab({
  config,
  onChange,
  studioOpen,
  onStudioOpenChange,
  onApplyLook,
}: BrandTabProps) {
  const tr = useTranslations("admin.owner.brand");
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="brand-name">{tr("name")}</Label>
        <Input
          id="brand-name"
          value={config.brand_name}
          onChange={(e) => onChange({ brand_name: e.target.value })}
          placeholder={tr("namePlaceholder")}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label>{tr("logo")}</Label>
          <AiBadge />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => onStudioOpenChange(true)}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {config.logo_recipe && Object.keys(config.logo_recipe).length
              ? tr("editLogo")
              : tr("createLogo")}
          </Button>
        </div>
        <LogoUploader
          logoUrl={config.logo_url}
          onChange={(patch) => onChange(patch)}
        />
        <LogoStudio
          open={studioOpen}
          onOpenChange={onStudioOpenChange}
          config={config}
          onSaved={(patch) => onChange(patch)}
        />
      </div>

      <LookPicker config={config} onApply={onApplyLook} />

      <div className="flex items-start justify-between gap-4 rounded-xl border bg-card/70 p-4">
        <div className="space-y-1">
          <Label className="text-sm">{tr("darkMode")}</Label>
          <p className="text-xs text-muted-foreground">{tr("darkModeHint")}</p>
        </div>
        <Switch
          checked={config.dark_mode_enabled}
          onCheckedChange={(dark_mode_enabled) =>
            onChange({ dark_mode_enabled })
          }
        />
      </div>
    </div>
  );
}
