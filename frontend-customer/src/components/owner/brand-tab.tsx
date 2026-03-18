"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { ThemeCardGrid } from "@/components/shared/theme-card-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { clientFetch } from "@/lib/api-client";
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { upload_url, s3_key } = await clientFetch<{
        upload_url: string;
        s3_key: string;
      }>("/api/v1/upload/presign/", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          category: "branding",
        }),
      });
      await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { file_url } = await clientFetch<{ file_url: string }>(
        "/api/v1/upload/complete/",
        {
          method: "POST",
          body: JSON.stringify({ s3_key, category: "branding" }),
        },
      );
      onChange({ logo_url: file_url });
    } catch (err) {
      console.error("Logo upload failed", err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
        <Label htmlFor="logo-url">Logo</Label>
        <div className="flex gap-2">
          <Input
            id="logo-url"
            value={config.logo_url}
            onChange={(e) => onChange({ logo_url: e.target.value })}
            placeholder="https://..."
            className="flex-1"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="shrink-0"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
        </div>
        {config.logo_url && (
          <img
            src={config.logo_url}
            alt="Logo preview"
            className="mt-1 h-10 w-auto rounded object-contain"
          />
        )}
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
