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

  // Clearing on both signals is what makes a stranded bar impossible: the
  // transition ending covers normal navigation, and a pathname change covers
  // browser back/forward and any router.push that bypassed this provider.
  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending, pathname]);

  const value = useMemo(
    () => ({ pathname, pendingHref, isPending, navigate, prefetch }),
    [pathname, pendingHref, isPending, navigate, prefetch],
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
