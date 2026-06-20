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

    const onUpdateFound = () => {
      const installing = reg?.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          notify();
        }
      });
    };

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      reg = registration;
      reg.addEventListener("updatefound", onUpdateFound);
    });

    return () => {
      reg?.removeEventListener("updatefound", onUpdateFound);
    };
  }, [t]);

  return null;
}
