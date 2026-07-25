"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";

interface NavigationContextValue {
  pathname: string;
  pendingHref: string | null;
  isPending: boolean;
  isNavigating: boolean;
  navigate: (href: string) => void;
  prefetch: (href: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const prefetched = useRef<Set<string>>(new Set());

  const navigate = useCallback(
    (href: string) => {
      if (href === pathname) return;
      // Both updates land in one batched render, so `isPending` is already true
      // by the time the clearing effect below runs.
      setPendingHref(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [router, pathname],
  );

  const prefetch = useCallback(
    (href: string) => {
      if (prefetched.current.has(href)) return;
      prefetched.current.add(href);
      router.prefetch(href);
    },
    [router],
  );

  // Commit is the only reliable end-of-navigation signal in Next 14's App
  // Router: router.push() inside startTransition does NOT keep isPending true
  // for the navigation's duration (measured: isPending false ~91ms into a
  // ~1000ms navigation), so clearing on !isPending ends the window almost
  // immediately and the progress bar never reaches its show threshold.
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  // Query-only navigations (same path, different search params) never change
  // `pathname`, so the commit effect above never re-runs for them. For that case
  // the transition's own completion IS a usable signal: there is no new route
  // segment to stream, so `isPending` tracks the update closely. It is only
  // cross-segment navigations where `isPending` resolves long before the route
  // commits — which is why it cannot be the general signal.
  useEffect(() => {
    if (isPending || pendingHref === null) return;
    if (pendingHref.split("?")[0] === pathname) setPendingHref(null);
  }, [isPending, pendingHref, pathname]);

  // Watchdog: if a navigation never commits (aborted, blocked by a route
  // guard, network error), don't strand the pending state forever.
  useEffect(() => {
    if (pendingHref === null) return;
    const timer = setTimeout(() => setPendingHref(null), 15000);
    return () => clearTimeout(timer);
  }, [pendingHref]);

  const isNavigating = pendingHref !== null;

  const value = useMemo(
    () => ({
      pathname,
      pendingHref,
      isPending,
      isNavigating,
      navigate,
      prefetch,
    }),
    [pathname, pendingHref, isPending, isNavigating, navigate, prefetch],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used inside <NavigationProvider>");
  }
  return ctx;
}

/** Convenience for programmatic navigation — the replacement for
 *  `useRouter().push` in app code. */
export function useNavigate(): (href: string) => void {
  return useNavigation().navigate;
}
