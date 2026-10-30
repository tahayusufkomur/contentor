"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";

import { BASE_DOMAIN } from "@/lib/constants";
import { tEnglish } from "@/lib/english-copy";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncAction } from "@shared/hooks/use-async-action";

interface ImpersonationState {
  email: string;
  by: string;
  scope: string;
}

// Fixed banner shown whenever the current session is impersonated. Reads the
// state from the signed session claim via /users/me (can't be spoofed), and
// offers an Exit that ends the impersonated session.
// Who reads it: a platform-scope session is a superadmin, so it stays English.
// A studio-scope session is a creator looking at their site as a student, so
// it speaks the site's language, like the page around it.
export function ImpersonationBanner() {
  const tSite = useTranslations("common");
  const [state, setState] = useState<ImpersonationState | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/users/me/", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.impersonating) {
          setState({
            email: data.email,
            by: data.impersonating.by,
            scope: data.impersonating.scope,
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const { run: exit, loading: busy } = useAsyncAction(async () => {
    if (!state) return;
    const res = await fetch("/api/auth/impersonate/stop", {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({ restored: false }));
    if (data.restored) {
      // Coach returns to their own admin.
      window.location.assign("/admin");
    } else if (state.scope === "platform") {
      // Superadmin returns to the platform panel on the apex domain.
      window.location.assign(
        `${window.location.protocol}//${BASE_DOMAIN}/admin`,
      );
    } else {
      window.location.assign("/");
    }
  });

  if (!state) return null;
  const t = state.scope === "platform" ? tEnglish : tSite;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-amber-500/40 bg-amber-500/95 text-amber-950 shadow-lg pb-safe">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            {t.rich("impersonation.viewingAs", {
              email: state.email,
              by: state.by,
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={exit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/90 px-3 py-1 font-medium text-amber-50 transition-colors hover:bg-amber-950 disabled:opacity-60"
        >
          {busy && <Spinner size="sm" />}
          {t("impersonation.exit")}
        </button>
      </div>
    </div>
  );
}
