"use client";

import { useState } from "react";
import { AlertTriangle, Check, MoreHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModalPortal } from "@/components/ui/modal-portal";
import { HelpChat } from "@/components/setup/help-chat";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";
import { BASE_DOMAIN } from "@/lib/constants";
import { ApiError } from "@/types/api";
import { BusyOverlay } from "./busy-overlay";

const signOutUrl = (message: string) =>
  `/login?toast=${encodeURIComponent(message)}&toast_type=info`;

// Why a site can't be cancelled here: the server's codes, each with a message (`menu.blocked.<code>`).
const CANCEL_BLOCKED = [
  "paid_plan",
  "payments_connected",
  "custom_domain",
  "provisioning",
  "setup_finished",
];

/** A way out of setup (there was none): progress is saved, "Finish later"
 * emails a sign-in link that leads straight back here, help, sign out — or
 * cancel setup, which deletes the unfinished site. */
export function SetupMenu({ email, slug }: { email: string; slug: string }) {
  const navigate = useNavigate();
  const t = useTranslations("admin.setupFlow");
  const [help, setHelp] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { run: cancelSetup, loading: cancelBusy } = useAsyncAction(
    async () => {
      await clientFetch("/api/v1/admin/setup-flow/cancel/", {
        method: "POST",
        body: JSON.stringify({ confirm: slug }),
      });
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      // A full load on the main site: this subdomain no longer exists.
      window.location.assign(
        `${window.location.protocol}//${BASE_DOMAIN}/dashboard`,
      );
    },
    {
      onError: (err) =>
        toast.error(
          err instanceof ApiError && CANCEL_BLOCKED.includes(err.message)
            ? t(`menu.blocked.${err.message}` as never)
            : t("menu.cancelError"),
        ),
    },
  );
  const { run: finishLater, loading: finishing } = useAsyncAction(
    async () => {
      if (email)
        await clientFetch("/api/v1/auth/magic-link/", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
      await fetch("/api/auth/logout", { method: "POST" });
      navigate(signOutUrl(t("menu.savedLogout")));
    },
    { errorToast: t("menu.linkError") },
  );
  const { run: signOut, loading: signingOut } = useAsyncAction(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate(signOutUrl(t("menu.savedLogin")));
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("menu.label")}
            title={t("menu.label")}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--sf-ink)] transition-colors hover:bg-[var(--sf-tint-strong)]"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <p className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] text-muted-foreground">
            <Check className="size-3.5" aria-hidden />
            {t("menu.saved")}
          </p>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void finishLater()}>
            {t("menu.finishLater")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHelp(true)}>
            {t("menu.help")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            {t("menu.signOut")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setCancelling(true)}
            className="text-destructive focus:text-destructive"
          >
            {t("menu.cancel")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {(finishing || signingOut) && (
        <ModalPortal>
          <BusyOverlay
            variant="screen"
            message={finishing ? t("menu.savingPlace") : t("menu.signingOut")}
            hint={finishing ? t("menu.emailing") : undefined}
          />
        </ModalPortal>
      )}
      {cancelling && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label={t("menu.keep")}
              onClick={() => setCancelling(false)}
              disabled={cancelBusy}
              className="absolute inset-0 bg-black/50"
            />
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label={t("menu.cancelAria")}
              className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-xl"
            >
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle
                  className="h-5 w-5 text-destructive"
                  aria-hidden
                />
                <h3 className="text-base font-semibold">
                  {t("menu.cancelTitle")}
                </h3>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                {t.rich("menu.cancelBody", {
                  slug,
                  b: (chunks) => (
                    <strong className="text-foreground">{chunks}</strong>
                  ),
                })}
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCancelling(false)}
                  disabled={cancelBusy}
                >
                  {t("menu.keep")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void cancelSetup()}
                  loading={cancelBusy}
                  loadingText={t("menu.deleting")}
                >
                  {t("menu.delete")}
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {help && (
        <ModalPortal>
          <div
            role="dialog"
            aria-label={t("menu.helpTitle")}
            className="fixed bottom-3 right-3 z-50 flex h-[min(640px,85dvh)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl motion-safe:animate-fade-in-up"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold">{t("menu.helpTitle")}</p>
              <button
                type="button"
                aria-label={t("menu.closeHelp")}
                onClick={() => setHelp(false)}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <HelpChat onNavigate={() => setHelp(false)} />
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
