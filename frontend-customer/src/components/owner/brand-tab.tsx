"use client";

import { ThemeCardGrid } from "@/components/shared/theme-card-grid";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LogoUploader } from "@/components/owner/logo-uploader";
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
}

export function BrandTab({ config, onChange }: BrandTabProps) {
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
        <Label>Logo</Label>
        <LogoUploader logoUrl={config.logo_url} onChange={(patch) => onChange(patch)} />
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
        <Label>Font family</Label>
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
      </div>
    </div>
  );
}
