"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { getEntitlements } from "@/lib/api/entitlements";
import {
  isFeatureLocked,
  type EntitlementKey,
  type Entitlements,
} from "@/lib/entitlements";

interface EntitlementsState {
  /** Null while loading or after a failed fetch. */
  entitlements: Entitlements | null;
  loading: boolean;
}

const EntitlementsContext = createContext<EntitlementsState>({
  entitlements: null,
  loading: true,
});

/**
 * Fetches the current coach's plan entitlements once and shares them with the
 * whole admin subtree (nav badges + in-page paid/AI controls). Mounted in
 * `AdminShell`. A failed fetch leaves `entitlements` null, which the badge
 * logic treats as "don't show a Paid badge" — fail-safe, never nags.
 */
export function EntitlementsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getEntitlements()
      .then((data) => {
        if (active) setEntitlements(data);
      })
      .catch(() => {
        if (active) setEntitlements(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({ entitlements, loading }),
    [entitlements, loading],
  );

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsState {
  return useContext(EntitlementsContext);
}

/**
 * Whether a "Paid" badge should show for `feature` — true only once
 * entitlements have loaded and the plan does not include it.
 */
export function useIsLocked(feature: EntitlementKey): boolean {
  const { entitlements } = useContext(EntitlementsContext);
  return isFeatureLocked(entitlements, feature);
}
