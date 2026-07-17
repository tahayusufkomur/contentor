"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DomainSearch } from "@/components/domain/domain-search";
import { RegistrantForm } from "@/components/domain/registrant-form";
import { ProvisioningStatus } from "@/components/domain/provisioning-status";
import { DomainManageCard } from "@/components/domain/domain-manage-card";
import {
  getDomainStatus,
  startCheckout,
  formatPrice,
  type CustomDomainStatus,
  type DomainResult,
  type RegistrantContact,
} from "@/lib/domains";

type Phase =
  | "loading"
  | "search"
  | "registrant"
  | "confirm"
  | "provisioning"
  | "live";

export function DomainWizard({
  slug,
  host,
  defaultEmail,
  defaultName,
}: {
  slug: string;
  host: string;
  defaultEmail: string;
  defaultName: string;
}) {
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [picked, setPicked] = useState<DomainResult | null>(null);
  const [contact, setContact] = useState<RegistrantContact | null>(null);
  const [live, setLive] = useState<CustomDomainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  // On mount: if a domain row already exists, jump to provisioning/live.
  useEffect(() => {
    let active = true;
    getDomainStatus(slug, host)
      .then(({ custom_domain }) => {
        if (!active) return;
        if (!custom_domain || custom_domain.provisioning_status === "lapsed") {
          setPhase("search");
        } else if (custom_domain.provisioning_status === "live") {
          setLive(custom_domain);
          setPhase("live");
        } else {
          setPhase("provisioning");
        }
      })
      .catch(() => active && setPhase("search"));
    return () => {
      active = false;
    };
  }, [slug, host]);

  const startPayment = async (c: RegistrantContact) => {
    if (!picked) return;
    setPaying(true);
    setError(null);
    try {
      const { checkout_url } = await startCheckout(slug, host, {
        domain: picked.domain,
        contact: c,
        return_path: `/dashboard/domain/${slug}`,
      });
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setPaying(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (phase === "live" && live) {
    return (
      <DomainManageCard
        slug={slug}
        host={host}
        domain={live}
        onRemoved={() => {
          setLive(null);
          setPicked(null);
          setPhase("search");
        }}
      />
    );
  }

  if (phase === "provisioning") {
    return (
      <ProvisioningStatus
        slug={slug}
        host={host}
        onLive={(d) => {
          setLive(d);
          setPhase("live");
        }}
      />
    );
  }

  if (phase === "search") {
    return (
      <DomainSearch
        slug={slug}
        host={host}
        onPick={(d) => {
          setPicked(d);
          setPhase("registrant");
        }}
      />
    );
  }

  if (phase === "registrant" && picked) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Registering{" "}
          <span className="font-medium text-foreground">{picked.domain}</span> —{" "}
          {formatPrice(picked.price_minor, picked.currency)} / year.
        </p>
        <RegistrantForm
          defaultEmail={defaultEmail}
          defaultName={defaultName}
          submitLabel="Continue to payment"
          onBack={() => setPhase("search")}
          onSubmit={(c) => {
            setContact(c);
            startPayment(c);
          }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {paying && (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Redirecting
            to secure payment…
          </p>
        )}
      </div>
    );
  }

  return null;
}
