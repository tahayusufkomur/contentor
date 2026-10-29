"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Mail, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InboxClient as SharedInboxClient } from "@shared/mailbox/inbox-client";
import { getSettings, type MailboxSettings } from "@/lib/mailbox";

export default function InboxClient() {
  const tr = useTranslations("admin.inbox.banner");
  const [settings, setSettings] = useState<MailboxSettings | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const canReceive = settings?.can_receive ?? true;

  const banner =
    settings && !canReceive && !bannerDismissed ? (
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-4 py-2.5 text-sm">
        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-muted-foreground">
          {settings.platform_eligible ? (
            <>{tr("pick")}</>
          ) : (
            <>
              {tr.rich("upgrade", {
                email: settings.from_email,
                b: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })}
            </>
          )}
        </span>
        <Button size="sm" variant="outline" asChild>
          <Link
            href={
              settings.platform_eligible ? "/admin/settings" : "/admin/billing"
            }
          >
            {settings.platform_eligible ? tr("choose") : tr("plans")}
          </Link>
        </Button>
        <button
          type="button"
          onClick={() => setBannerDismissed(true)}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={tr("dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ) : null;

  return <SharedInboxClient topBanner={banner} />;
}
