"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Image, MoonStar, Palette, Save, Type, Wand2 } from "lucide-react";
import { ThemeCardGrid } from "@/components/shared/theme-card-grid";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { LogoStudio } from "@/components/logo/logo-studio";
import { clientFetch } from "@/lib/api-client";
import { getThemePalette } from "@/lib/themes";
import type { TenantConfig } from "@/types/tenant";

export default function DesignSettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);

  useEffect(() => {
    clientFetch<TenantConfig>("/api/v1/admin/config/")
      .then(setConfig)
      .catch(console.error);
  }, []);

  // Deep link from the setup assistant: /admin/design?studio=1
  // (window.location in an effect, NOT useSearchParams — avoids the Next 14
  // client-side Suspense bailout at build time.)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("studio") === "1") {
      setStudioOpen(true);
    }
  }, []);

  async function handleSave() {
    if (!config) return;

    setSaving(true);
    try {
      await clientFetch("/api/v1/admin/config/", {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const theme = getThemePalette(config.theme);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Design Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure brand identity, curated color themes, and public dark
            mode.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Branding
            </CardTitle>
            <CardDescription>Set your brand name and logo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand_name">Brand Name</Label>
              <Input
                id="brand_name"
                value={config.brand_name}
                onChange={(e) =>
                  setConfig({ ...config, brand_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Logo</Label>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setStudioOpen(true)}>
                <Wand2 className="h-4 w-4" />
                {config.logo_recipe && Object.keys(config.logo_recipe).length ? "Edit logo in Logo Studio" : "Create a logo in Logo Studio"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo_url">Logo URL</Label>
              <Input
                id="logo_url"
                value={config.logo_url}
                onChange={(e) =>
                  setConfig({ ...config, logo_url: e.target.value })
                }
                placeholder="https://..."
              />
              {config.logo_url && (
                <div className="mt-2 flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                  <img
                    src={config.logo_url}
                    alt="Logo preview"
                    className="h-10 w-auto"
                  />
                  <span className="text-xs text-muted-foreground">
                    Logo preview
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MoonStar className="h-5 w-5" />
              Theme Controls
            </CardTitle>
            <CardDescription>
              Themes set the entire palette, including accents, borders, charts,
              and the cinematic wash.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ThemeCardGrid
              selectedTheme={config.theme}
              onSelect={(selectedTheme) =>
                setConfig({ ...config, theme: selectedTheme })
              }
            />
            <div className="flex items-start justify-between gap-4 rounded-xl border bg-card/70 p-4">
              <div className="space-y-1">
                <Label className="text-sm">Allow dark mode for visitors</Label>
                <p className="text-xs text-muted-foreground">
                  Controls whether the public-facing header shows a light/dark
                  toggle.
                </p>
              </div>
              <Switch
                checked={config.dark_mode_enabled}
                onCheckedChange={(dark_mode_enabled) =>
                  setConfig({ ...config, dark_mode_enabled })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Typography
            </CardTitle>
            <CardDescription>
              Choose a font for your platform. Must be a Google Fonts family
              name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="font_family">Font Family</Label>
              <Input
                id="font_family"
                value={config.font_family}
                onChange={(e) =>
                  setConfig({ ...config, font_family: e.target.value })
                }
                placeholder="Inter"
              />
              {config.font_family && (
                <p
                  className="mt-2 rounded-md border bg-muted/30 p-3 text-sm"
                  style={{ fontFamily: config.font_family }}
                >
                  The quick brown fox jumps over the lazy dog.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Preview
            </CardTitle>
            <CardDescription>
              Light-mode preview of the selected theme.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="overflow-hidden rounded-2xl border p-3"
              style={{
                backgroundColor: theme.light.background,
                backgroundImage: theme.cinematic.light,
              }}
            >
              <div
                className="overflow-hidden rounded-xl border"
                style={{
                  backgroundColor: theme.light.card,
                  borderColor: theme.light.border,
                }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    backgroundColor: theme.light.primary,
                    color: theme.light["primary-foreground"],
                  }}
                >
                  <span className="text-sm font-bold">
                    {config.brand_name || "Your Brand"}
                  </span>
                  <div className="flex gap-3 text-xs opacity-80">
                    <span>Courses</span>
                    <span>Sign In</span>
                  </div>
                </div>
                <div
                  className="space-y-3 p-4"
                  style={{ color: theme.light.foreground }}
                >
                  <div>
                    <p
                      className="text-lg font-bold"
                      style={{ fontFamily: config.font_family || "inherit" }}
                    >
                      {config.brand_name || "Your Brand"}
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: theme.light["muted-foreground"] }}
                    >
                      Your platform tagline here
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {theme.preview.map((swatch) => (
                      <span
                        key={swatch}
                        className="h-7 flex-1 rounded-md border border-black/5"
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                  </div>
                  <div
                    className="w-fit rounded-md px-4 py-1.5 text-xs font-medium"
                    style={{
                      backgroundColor: theme.light.accent,
                      color: theme.light["accent-foreground"],
                    }}
                  >
                    Browse Courses
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <LogoStudio
        open={studioOpen}
        onOpenChange={setStudioOpen}
        config={config}
        onSaved={(patch) => setConfig({ ...config, ...patch })}
      />
    </div>
  );
}
