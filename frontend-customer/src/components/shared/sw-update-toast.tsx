"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function SwUpdateToast() {
  const t = useTranslations("pwa");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | undefined;

    const notify = () => {
      toast(t("updateAvailable"), {
        action: { label: t("refresh"), onClick: () => window.location.reload() },
        duration: Infinity,
      });
    };

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      reg = registration;
      reg.addEventListener("updatefound", () => {
        const installing = reg?.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // A new worker reached "installed" while a controller already exists
          // → this is an update, not a first install.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            notify();
          }
        });
      });
    });
  }, [t]);

  return null;
}
