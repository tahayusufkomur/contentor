"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { languageHeader } from "@/lib/api/page-language";

export function MagicLinkForm() {
  const t = useTranslations("auth.magicLink");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const { run: handleSubmit, loading } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      const res = await fetch("/api/v1/auth/magic-link/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...languageHeader() },
        body: JSON.stringify({ email }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || t("genericError"));
        return;
      }
      setSent(true);
    },
    {
      // Inline field-adjacent error, not a toast, for this auth form.
      onError: () => setError(t("networkError")),
    },
  );

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <h2 className="mt-5 text-[17px] font-semibold tracking-[-0.015em]">
          {t("checkEmail")}
        </h2>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          {t.rich("sentTo", {
            email,
            strong: (chunks) => (
              <strong className="text-foreground">{chunks}</strong>
            ),
          })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label
          htmlFor="magic-email"
          className="text-caption font-medium text-foreground"
        >
          {t("emailLabel")}
        </Label>
        <Input
          id="magic-email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      <Button
        type="submit"
        variant="brand"
        size="lg"
        className="w-full rounded-full"
        loading={loading}
        loadingText={t("sending")}
      >
        {t("submit")}
      </Button>
    </form>
  );
}
