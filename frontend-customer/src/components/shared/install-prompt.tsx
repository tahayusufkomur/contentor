"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    if (standalone) return;

    setHidden(false);

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIos) setShowIosHint(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      dismiss();
    } else {
      // User declined Chrome's native dialog — hide the button but don't
      // permanently dismiss; they can still install later.
      setDeferred(null);
    }
  };

  // Never show inside the coach admin, in standalone, after dismissal, or with
  // nothing to offer.
  if (pathname?.startsWith("/admin")) return null;
  if (hidden || (!deferred && !showIosHint)) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm text-foreground shadow-lg"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-live="polite"
    >
      <span className="flex-1">
        {deferred ? t("installPrompt") : t("iosHint")}{" "}
        <Link
          href="/install"
          className="font-medium text-primary underline underline-offset-2"
        >
          {t("howToInstall")}
        </Link>
      </span>
      {deferred && (
        <button
          onClick={install}
          className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground"
        >
          {t("install")}
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
