"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { errorMessage } from "@shared/hooks/async-runner";

export function MagicLinkForm() {
  const t = useTranslations("student.auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const { run: handleSubmit, loading } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      let res: Response;
      try {
        res = await fetch("/api/v1/auth/magic-link/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
          credentials: "same-origin",
        });
      } catch {
        throw new Error(t("networkError"));
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || t("magicLinkError"));
      }
      if (data.demo_redirect) {
        window.location.href = data.demo_redirect;
        return;
      }
      setSent(true);
    },
    {
      errorToast: false,
      onError: (err) => setError(errorMessage(err, t("magicLinkError"))),
    },
  );

  const { run: handleCodeSubmit, loading: codeLoading } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setCodeError("");
      let res: Response;
      try {
        res = await fetch("/api/v1/auth/magic-link/verify-code/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
          credentials: "same-origin",
        });
      } catch {
        throw new Error(t("networkError"));
      }
      if (!res.ok) {
        throw new Error(t("codeError"));
      }
      setCode("");
      window.location.href = "/";
    },
    {
      errorToast: false,
      onError: (err) => setCodeError(errorMessage(err, t("codeError"))),
    },
  );

  if (sent) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">{t("magicLinkSentTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.rich("magicLinkSentBody", {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <form onSubmit={handleCodeSubmit} className="mt-6 space-y-3 text-left">
          <Label htmlFor="login-code">{t("codeHint")}</Label>
          <Input
            id="login-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder={t("codePlaceholder")}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-xl tracking-[0.5em]"
          />
          {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={code.length !== 6}
            loading={codeLoading}
            loadingText={t("codeSubmitting")}
          >
            {t("codeSubmit")}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("magicLinkLabel")}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t("magicLinkPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="submit"
        className="w-full"
        loading={loading}
        loadingText={t("magicLinkSubmitting")}
      >
        {t("magicLinkSubmit")}
      </Button>
    </form>
  );
}
