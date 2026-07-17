"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDomainStatus,
  retryProvision,
  type CustomDomainStatus,
} from "@/lib/domains";

const STEPS: { key: string; label: string }[] = [
  { key: "registering", label: "Registering the domain" },
  { key: "dns_zone", label: "Creating the DNS zone" },
  { key: "dns_records", label: "Pointing DNS at your site" },
  { key: "email_auth", label: "Configuring email" },
  { key: "ssl", label: "Issuing the SSL certificate" },
  { key: "live", label: "Going live" },
];

function stepIndex(status: string): number {
  const i = STEPS.findIndex((s) => s.key === status);
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
  const [cd, setCd] = useState<CustomDomainStatus | null>(null);
  const [retrying, setRetrying] = useState(false);
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

  const retry = async () => {
    if (!cd) return;
    setRetrying(true);
    try {
      await retryProvision(slug, host, cd.id);
      setPollKey((k) => k + 1);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {STEPS.map((s, i) => {
          const done = i < current || cd?.provisioning_status === "live";
          const active =
            i === current && !failed && cd?.provisioning_status !== "live";
          return (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]">
                {done ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
                )}
              </span>
              <span
                className={
                  done || active ? "text-foreground" : "text-muted-foreground"
                }
              >
                {s.label}
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
              Setup failed{cd?.failed_step ? ` at: ${cd.failed_step}` : ""}.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={retry}
              disabled={retrying}
            >
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}{" "}
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
