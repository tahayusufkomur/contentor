"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import type { MyTenant } from "@/lib/tenants";
import { ApiError } from "@/types/api";

type Blocker = NonNullable<MyTenant["delete_blocker"]>;

const BLOCKED_COPY: Record<Blocker, string> = {
  paid_plan: "Cancel the paid plan first — paid platforms can't be deleted.",
  payments_connected:
    "This platform has a connected payments account. Contact support to remove it.",
  custom_domain: "Remove the custom domain first.",
  provisioning: "Still being set up — try again in a few minutes.",
  not_deletable: "This platform can't be deleted.",
};

async function deletePlatform(slug: string): Promise<void> {
  const res = await fetch(`/api/tenants/${slug}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: slug }),
  });
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  throw new ApiError(res.status, body as Record<string, unknown>);
}

function failureMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const copy = BLOCKED_COPY[err.message as Blocker];
    if (copy) return copy;
  }
  return "Couldn't delete this platform. Try again.";
}

/** Delete a platform that was never paid for. Typing its address confirms. */
export function DeletePlatform({
  slug,
  name,
  blocker,
}: {
  slug: string;
  name: string;
  blocker: MyTenant["delete_blocker"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();

  const { run: confirm, loading } = useAsyncAction(
    async () => {
      await deletePlatform(slug);
      setOpen(false);
      toast.success(`${name} was deleted.`);
      router.refresh();
    },
    { onError: (err) => toast.error(failureMessage(err)) },
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading]);

  const close = () => {
    setOpen(false);
    setTyped("");
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={blocker !== null}
        title={blocker ? BLOCKED_COPY[blocker] : undefined}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      {open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Cancel"
              onClick={close}
              disabled={loading}
              className="absolute inset-0 bg-black/50"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${inputId}-title`}
              className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-xl"
            >
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h3 id={`${inputId}-title`} className="text-base font-semibold">
                  Delete {name}?
                </h3>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                This permanently deletes the site, its courses, classes,
                students and files, and frees up{" "}
                <strong className="text-foreground">{slug}</strong>. It
                can&apos;t be undone.
              </p>
              <label
                htmlFor={inputId}
                className="mb-1.5 block text-[12.5px] font-medium"
              >
                Type <span className="font-mono">{slug}</span> to confirm
              </label>
              <Input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoFocus
                className="mb-4"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void confirm()}
                  disabled={typed.trim() !== slug}
                  loading={loading}
                  loadingText="Deleting…"
                >
                  Delete platform
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
