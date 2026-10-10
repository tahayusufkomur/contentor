"use client";

import { useState } from "react";
import { Check, MoreHorizontal, X } from "lucide-react";
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
import { clientFetch } from "@/lib/api-client";

const signOutUrl = (message: string) =>
  `/login?toast=${encodeURIComponent(message)}&toast_type=info`;

/** A way out of setup (there was none): progress is saved, "Finish later"
 * emails a sign-in link that leads straight back here, help, sign out. */
export function SetupMenu({ email }: { email: string }) {
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  const { run: finishLater } = useAsyncAction(
    async () => {
      if (email)
        await clientFetch("/api/v1/auth/magic-link/", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
      await fetch("/api/auth/logout", { method: "POST" });
      navigate(
        signOutUrl(
          "Everything is saved. We emailed you a link to pick up where you left off.",
        ),
      );
    },
    { errorToast: "Couldn’t send your link. Try again." },
  );
  const { run: signOut } = useAsyncAction(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate(signOutUrl("Everything is saved. Log in any time to continue."));
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Setup menu"
            title="Setup menu"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--sf-ink)] transition-colors hover:bg-[var(--sf-tint-strong)]"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <p className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] text-muted-foreground">
            <Check className="size-3.5" aria-hidden />
            Saved automatically
          </p>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void finishLater()}>
            Finish later (email me a link)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHelp(true)}>
            Get help
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {help && (
        <ModalPortal>
          <div
            role="dialog"
            aria-label="Help"
            className="fixed bottom-3 right-3 z-50 flex h-[min(640px,85dvh)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl motion-safe:animate-fade-in-up"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-semibold">Help</p>
              <button
                type="button"
                aria-label="Close help"
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
