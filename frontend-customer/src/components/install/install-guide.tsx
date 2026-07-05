"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { detectPlatform } from "@/lib/usage";
import { isStandalone } from "@/lib/push";
import {
  AndroidConfirmStep,
  AndroidInstallStep,
  AndroidMenuStep,
  InstalledCheck,
  IosAddStep,
  IosConfirmStep,
  IosShareStep,
} from "@/components/install/install-illustrations";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Tab = "ios" | "android";

export function InstallGuide() {
  const t = useTranslations("pwa");
  const [tab, setTab] = useState<Tab>("ios");
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    setTab(detectPlatform() === "android" ? "android" : "ios");
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (installed) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <InstalledCheck className="mx-auto h-20 w-20" />
        <h1 className="mt-4 text-xl font-semibold">
          {t("guide.installedTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("guide.installedBody")}
        </p>
      </div>
    );
  }

  const steps =
    tab === "ios"
      ? [
          {
            art: <IosShareStep className="h-32 w-auto" />,
            text: t("guide.iosStep1"),
          },
          {
            art: (
              <IosAddStep
                label={t("guide.iosAddLabel")}
                className="h-32 w-auto"
              />
            ),
            text: t("guide.iosStep2"),
          },
          {
            art: (
              <IosConfirmStep
                label={t("guide.iosAddButton")}
                className="h-32 w-auto"
              />
            ),
            text: t("guide.iosStep3"),
          },
        ]
      : [
          {
            art: <AndroidMenuStep className="h-32 w-auto" />,
            text: t("guide.androidStep1"),
          },
          {
            art: (
              <AndroidInstallStep
                label={t("guide.androidInstallLabel")}
                className="h-32 w-auto"
              />
            ),
            text: t("guide.androidStep2"),
          },
          {
            art: (
              <AndroidConfirmStep
                label={t("guide.androidInstallButton")}
                className="h-32 w-auto"
              />
            ),
            text: t("guide.androidStep3"),
          },
        ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("guide.title")}
        </h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t("guide.subtitle")}
        </p>
      </div>

      {deferred && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
          <button
            onClick={install}
            className="rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground"
          >
            {t("guide.installNow")}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("guide.orManual")}
          </p>
        </div>
      )}

      <div className="flex justify-center gap-2">
        <button
          onClick={() => setTab("ios")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === "ios" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
        >
          {t("guide.tabIos")}
        </button>
        <button
          onClick={() => setTab("android")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tab === "android" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
        >
          {t("guide.tabAndroid")}
        </button>
      </div>

      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li
            key={i}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <p className="flex-1 text-sm">{step.text}</p>
            <span className="shrink-0">{step.art}</span>
          </li>
        ))}
      </ol>

      {tab === "ios" && (
        <p className="rounded-lg bg-muted/50 p-3 text-center text-xs text-muted-foreground">
          {t("guide.iosNote")}
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {t("guide.desktopNote")}
      </p>
    </div>
  );
}
