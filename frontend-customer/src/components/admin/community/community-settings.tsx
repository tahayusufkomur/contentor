"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getAdminSettings, patchAdminSettings } from "@/lib/community-admin";
import type { CommunitySettings } from "@/types/community";

export function CommunitySettingsTab() {
  const [settings, setSettings] = useState<CommunitySettings | null>(null);
  const [welcome, setWelcome] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAdminSettings()
      .then((s) => {
        setSettings(s);
        setWelcome(s.welcome_message);
      })
      .catch(() => toast.error("Couldn't load community settings."));
  }, []);

  if (!settings) return <Skeleton className="h-48 w-full" />;

  const apply = async (patch: Partial<CommunitySettings>) => {
    setBusy(true);
    try {
      const updated = await patchAdminSettings(patch);
      setSettings(updated);
      toast.success("Saved.");
    } catch {
      toast.error("Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Community</Label>
            <p className="text-sm text-muted-foreground">
              When on, students see a Community tab and can post, react and
              comment.
            </p>
          </div>
          <Switch
            checked={settings.is_enabled}
            disabled={busy}
            onCheckedChange={(on) => void apply({ is_enabled: on })}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Notify students when you post</Label>
            <p className="text-sm text-muted-foreground">
              Sends a push notification to members whenever you or your team
              posts.
            </p>
          </div>
          <Switch
            checked={settings.notify_on_coach_post ?? true}
            disabled={busy}
            onCheckedChange={(on) => void apply({ notify_on_coach_post: on })}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-base">Welcome message</Label>
          <p className="text-sm text-muted-foreground">
            Shown at the top of the community feed.
          </p>
          <Textarea
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            rows={3}
            placeholder="Welcome! Introduce yourself and be kind. 💛"
          />
          <Button
            size="sm"
            disabled={busy || welcome === settings.welcome_message}
            onClick={() => void apply({ welcome_message: welcome })}
          >
            Save message
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
