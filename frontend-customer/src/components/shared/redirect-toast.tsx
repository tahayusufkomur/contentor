"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

/**
 * Reads `?toast=` and optional `?toast_type=` query params on mount,
 * fires a Sonner toast, then strips both params from the URL.
 *
 * Mount once in the root layout alongside <Toaster />.
 *
 * Usage: router.push('/login?toast=You+need+to+log+in&toast_type=error')
 */
export function RedirectToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const message = searchParams.get("toast");
    if (!message) return;

    const type = searchParams.get("toast_type") ?? "info";

    switch (type) {
      case "success":
        toast.success(message);
        break;
      case "error":
        toast.error(message);
        break;
      default:
        toast.info(message);
    }

    // Strip toast params from the URL without a navigation
    const params = new URLSearchParams(searchParams.toString());
    params.delete("toast");
    params.delete("toast_type");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, pathname, router]);

  return null;
}
