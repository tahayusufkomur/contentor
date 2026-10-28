"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAsyncAction } from "@shared/hooks/use-async-action";

interface PreviewGateProps {
  brandName?: string;
  hasPassword?: boolean;
  /** The site is paused (its plan ended), not yet launched: no preview. */
  paused?: boolean;
}

export function PreviewGate({
  brandName,
  hasPassword: withPassword,
  paused,
}: PreviewGateProps) {
  const t = useTranslations("site");
  const hasPassword = withPassword && !paused;
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const { run: submit, loading: submitting } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(false);
      const res = await fetch("/api/preview/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      throw new Error("Incorrect password");
    },
    { errorToast: false, onError: () => setError(true) },
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {brandName || t("preview.comingSoon")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {paused
              ? t("preview.paused")
              : hasPassword
                ? t("preview.launchingGated")
                : t("preview.launching")}
          </p>
        </div>

        {hasPassword && (
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("preview.field")}
              autoFocus
            />
            {error && (
              <p className="text-xs text-destructive">
                {t("preview.incorrect")}
              </p>
            )}
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={!password}
              loading={submitting}
              loadingText={t("preview.checking")}
            >
              {t("preview.enter")}
            </Button>
          </form>
        )}

        <a
          href="/login"
          className="inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("preview.ownerLogin")}
        </a>
      </div>
    </div>
  );
}
