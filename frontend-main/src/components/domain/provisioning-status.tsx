"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  getDomainStatus,
  retryProvision,
  type CustomDomainStatus,
} from "@/lib/domains";

const STEPS = [
  "registering",
  "dns_zone",
  "dns_records",
  "email_auth",
  "ssl",
  "live",
] as const;

const isStep = (s: string): s is (typeof STEPS)[number] =>
  (STEPS as readonly string[]).includes(s);

function stepIndex(status: string): number {
  const i = STEPS.findIndex((s) => s === status);
  return i === -1 ? 0 : i;
}

export function ProvisioningStatus({
  slug,
  host,
  onLive,
}: {
  slug: string;
  host: string;
  onLive: (d: CustomDomainStatus) => void;
}) {
  const t = useTranslations("domain.status");
  const [cd, setCd] = useState<CustomDomainStatus | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const { custom_domain } = await getDomainStatus(slug, host);
        if (!active) return;
        setCd(custom_domain);
        if (custom_domain?.provisioning_status === "live") {
          onLiveRef.current(custom_domain);
          return;
        }
        if (custom_domain?.provisioning_status === "failed") {
          return;
        }
      } catch {
        // transient — keep polling
      }
      if (active) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [slug, host, pollKey]);

  const failed = cd?.provisioning_status === "failed";
  const current = stepIndex(cd?.provisioning_status ?? "registering");

  const { run: retry, loading: retrying } = useAsyncAction(async () => {
    if (!cd) return;
    await retryProvision(slug, host, cd.id);
    setPollKey((k) => k + 1);
  });

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {STEPS.map((step, i) => {
          const done = i < current || cd?.provisioning_status === "live";
          const active =
            i === current && !failed && cd?.provisioning_status !== "live";
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]">
                {done ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : active ? (
                  <Spinner size="sm" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
                )}
              </span>
              <span
                className={
                  done || active ? "text-foreground" : "text-muted-foreground"
                }
              >
                {t(`steps.${step}`)}
              </span>
            </li>
          );
        })}
      </ol>

      {failed && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>
              {cd?.failed_step
                ? t("failedAt", {
                    step: isStep(cd.failed_step)
                      ? t(`steps.${cd.failed_step}`)
                      : cd.failed_step,
                  })
                : t("failed")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={retry}
              loading={retrying}
              loadingText={t("retrying")}
            >
              <RefreshCw className="h-4 w-4" /> {t("retry")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
