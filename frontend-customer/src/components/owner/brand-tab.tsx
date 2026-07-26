"use client";

import { Wand2 } from "lucide-react";
import { ThemeCardGrid } from "@/components/shared/theme-card-grid";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AiBadge, PaidFeatureBadge } from "@/components/admin/feature-badges";
import { LogoUploader } from "@/components/owner/logo-uploader";
import { LogoStudio } from "@/components/logo/logo-studio";
import type { TenantConfig } from "@/types/tenant";

const FONTS = [
  "Inter",
  "Geist",
  "Poppins",
  "Nunito",
  "DM Sans",
  "Playfair Display",
  "Merriweather",
  "Lora",
];

interface BrandTabProps {
  config: TenantConfig;
  onChange: (patch: Partial<TenantConfig>) => void;
  /** Logo Studio open state — owned by EditSidebar so `?studio=1` can open it. */
  studioOpen: boolean;
  onStudioOpenChange: (open: boolean) => void;
}

export function BrandTab({
  config,
  onChange,
  studioOpen,
  onStudioOpenChange,
}: BrandTabProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="brand-name">Brand name</Label>
        <Input
          id="brand-name"
          value={config.brand_name}
          onChange={(e) => onChange({ brand_name: e.target.value })}
          placeholder="My Platform"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label>Logo</Label>
          <AiBadge />
          <PaidFeatureBadge feature="logo_studio" />
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
              ? "Edit logo"
              : "Create a logo"}
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

      <div className="space-y-2">
        <div>
          <Label>Theme</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a complete palette for surfaces, accents, charts, and the
            cinematic background.
          </p>
        </div>
        <ThemeCardGrid
          selectedTheme={config.theme}
          onSelect={(theme) => onChange({ theme })}
        />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border bg-card/70 p-4">
        <div className="space-y-1">
          <Label className="text-sm">Allow dark mode for visitors</Label>
          <p className="text-xs text-muted-foreground">
            Shows a light/dark toggle in the public header and keeps the dark
            palette available.
          </p>
        </div>
        <Switch
          checked={config.dark_mode_enabled}
          onCheckedChange={(dark_mode_enabled) =>
            onChange({ dark_mode_enabled })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="font-family">Font family</Label>
        <div className="flex flex-wrap gap-2">
          {FONTS.map((font) => (
            <button
              key={font}
              type="button"
              onClick={() => onChange({ font_family: font })}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${config.font_family === font ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"}`}
            >
              {font}
            </button>
          ))}
        </div>
        <Input
          id="font-family"
          value={config.font_family}
          onChange={(e) => onChange({ font_family: e.target.value })}
          placeholder="Inter"
        />
        <p className="text-xs text-muted-foreground">
          Any Google Fonts family name works — type one to go beyond the
          presets.
        </p>
        {config.font_family && (
          <p
            className="rounded-md border bg-muted/30 p-3 text-sm"
            style={{ fontFamily: config.font_family }}
          >
            The quick brown fox jumps over the lazy dog.
          </p>
        )}
      </div>
    </div>
  );
}
