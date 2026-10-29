"use client";

import { useState } from "react";
import { Globe2, Trash2 } from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  removeDomain,
  formatPrice,
  type CustomDomainStatus,
} from "@/lib/domains";
import { useLocale, useTranslations } from "next-intl";

export function DomainManageCard({
  slug,
  host,
  domain,
  onRemoved,
}: {
  slug: string;
  host: string;
  domain: CustomDomainStatus;
  onRemoved: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("domain.manage");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { run: remove, loading: busy } = useAsyncAction(
    async () => {
      setError(null);
      await removeDomain(slug, host, domain.id);
      onRemoved();
    },
    {
      onError: (err) =>
        setError(err instanceof Error ? err.message : t("removeFailed")),
    },
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-lg font-semibold">
          <Globe2 className="h-5 w-5 text-muted-foreground" />
          {domain.domain}
        </span>
        <Badge>{t("live")}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">{t("yearlyPrice")}</dt>
        <dd className="text-right">
          {formatPrice(domain.price_minor, domain.currency, locale)}
        </dd>
        <dt className="text-muted-foreground">{t("renews")}</dt>
        <dd className="text-right">
          {domain.expires_at
            ? new Date(domain.expires_at).toLocaleDateString(locale)
            : "—"}
        </dd>
      </dl>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {confirming ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <span className="text-sm text-destructive">{t("confirmRemove")}</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={remove}
              loading={busy}
              loadingText={t("removing")}
            >
              <Trash2 className="h-4 w-4" /> {t("remove")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" /> {t("removeDomain")}
        </Button>
      )}
    </div>
  );
}
