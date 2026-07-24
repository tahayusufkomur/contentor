"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getAdminSettings, patchAdminSettings } from "@/lib/community-admin";
import type { CommunitySettings } from "@/types/community";
import { useAsyncAction } from "@shared/hooks/use-async-action";

export function CommunitySettingsTab() {
  const [settings, setSettings] = useState<CommunitySettings | null>(null);
  const [welcome, setWelcome] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getAdminSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setWelcome(s.welcome_message);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err);
        toast.error("Couldn't load community settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Each control patches a different field — independent hooks so toggling
  // one switch never disables the others or the (unrelated) save button.
  const { run: toggleEnabled, loading: togglingEnabled } = useAsyncAction(
    async (on: boolean) => {
      const updated = await patchAdminSettings({ is_enabled: on });
      setSettings(updated);
      toast.success("Saved.");
    },
    { errorToast: "Couldn't save." },
  );
  const { run: toggleNotify, loading: togglingNotify } = useAsyncAction(
    async (on: boolean) => {
      const updated = await patchAdminSettings({ notify_on_coach_post: on });
      setSettings(updated);
      toast.success("Saved.");
    },
    { errorToast: "Couldn't save." },
  );
  const { run: saveWelcome, loading: savingWelcome } = useAsyncAction(
    async () => {
      const updated = await patchAdminSettings({ welcome_message: welcome });
      setSettings(updated);
      toast.success("Saved.");
    },
    { errorToast: "Couldn't save." },
  );

  return (
    <PageState
      loading={loading}
      error={loadError}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<Skeleton className="h-48 w-full" />}
    >
      {settings && (
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
                disabled={togglingEnabled}
                onCheckedChange={(on) => void toggleEnabled(on)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">
                  Notify students when you post
                </Label>
                <p className="text-sm text-muted-foreground">
                  Sends a push notification to members whenever you or your team
                  posts.
                </p>
              </div>
              <Switch
                checked={settings.notify_on_coach_post ?? true}
                disabled={togglingNotify}
                onCheckedChange={(on) => void toggleNotify(on)}
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
                loading={savingWelcome}
                loadingText="Saving…"
                disabled={welcome === settings.welcome_message}
                onClick={() => void saveWelcome()}
              >
                Save message
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageState>
  );
}
