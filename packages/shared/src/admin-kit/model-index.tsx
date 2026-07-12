"use client";

// Shared admin-kit (schema-driven admin renderer).
// Canonical copy: frontend-customer. After editing, run scripts/sync-admin-kit.sh
// to mirror into frontend-main — the two copies must stay byte-identical.
//
// Landing page: one card per registered model, straight from the site meta.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { AdminKitError, createAdminClient } from "@/lib/admin-kit/client";
import type { SiteMeta } from "@/lib/admin-kit/types";

import { KitBanner, KitSkeletonRows, kitIcon } from "./primitives";

export function AdminModelIndex({
  apiBase,
  basePath,
}: {
  apiBase: string;
  basePath: string;
}) {
  const client = useMemo(() => createAdminClient(apiBase), [apiBase]);
  const [site, setSite] = useState<SiteMeta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    client
      .siteMeta()
      .then((meta) => {
        if (!cancelled) setSite(meta);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof AdminKitError ? err.detail : "Failed to load.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <KitBanner
          kind="error"
          message={error}
          onDismiss={() => setError("")}
        />
      </div>
    );
  }

  if (!site) return <KitSkeletonRows rows={4} />;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Data
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse, edit and act on {site.title.toLowerCase()} records.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {site.models.map((model) => {
          const Icon = kitIcon(model.icon);
          return (
            <Link
              key={model.key}
              href={`${basePath}/${model.key}`}
              className="group rounded-lg border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-muted p-2 text-muted-foreground group-hover:text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-semibold text-foreground">
                  {model.label_plural}
                </h2>
              </div>
              {model.description && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {model.description}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
