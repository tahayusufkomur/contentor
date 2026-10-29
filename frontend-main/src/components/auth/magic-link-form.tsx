"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { languageHeader } from "@/lib/api/page-language";

export function MagicLinkForm() {
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
        setError(data.detail || "Something went wrong");
        return;
      }
      setSent(true);
    },
    {
      // Inline field-adjacent error, not a toast, for this auth form.
      onError: () => setError("Network error. Please try again."),
    },
  );

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <h2 className="mt-5 text-[17px] font-semibold tracking-[-0.015em]">
          Check your email
        </h2>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          We sent a login link to{" "}
          <strong className="text-foreground">{email}</strong>
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
          Email
        </Label>
        <Input
          id="magic-email"
          type="email"
          placeholder="you@example.com"
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
        loadingText="Sending…"
      >
        Send Magic Link
      </Button>
    </form>
  );
}
