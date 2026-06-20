"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { isStandalone, pushSupported, subscribeToPush } from "@/lib/push";

const DISMISS_KEY = "pwa-push-dismissed";

export function PushOptIn() {
  const t = useTranslations("pwa");
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (!pushSupported() || !isStandalone()) return; // iOS: only installed PWAs
    if (Notification.permission === "granted") return;
    setShow(true);
  }, []);

  if (!show || pathname?.startsWith("/admin")) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const enable = async () => {
    const ok = await subscribeToPush();
    if (!ok) toast.error(t("enablePush"));
    dismiss();
  };

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground shadow-lg"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
    >
      <span className="flex-1">{t("enablePush")}</span>
      <button onClick={enable} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground">
        {t("enable")}
      </button>
      <button onClick={dismiss} className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground">
        {t("notNow")}
      </button>
    </div>
  );
}
