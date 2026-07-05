"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PreviewGateProps {
  brandName?: string;
  hasPassword?: boolean;
}

export function PreviewGate({ brandName, hasPassword }: PreviewGateProps) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch("/api/preview/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      setError(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {brandName || "Coming soon"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasPassword
              ? "This site is launching soon. Enter the preview password to take a look."
              : "This site is launching soon. Check back shortly."}
          </p>
        </div>

        {hasPassword && (
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Preview password"
              autoFocus
            />
            {error && (
              <p className="text-xs text-destructive">
                Incorrect password. Try again.
              </p>
            )}
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={submitting || !password}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Enter site
            </Button>
          </form>
        )}

        <a
          href="/login"
          className="inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Site owner? Log in to preview
        </a>
      </div>
    </div>
  );
}
