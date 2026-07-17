"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/magic-link/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl glass-strong">
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
          className="text-[13px] font-medium text-foreground/80"
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
        className="w-full"
        loading={loading}
      >
        {loading ? "Sending…" : "Send Magic Link"}
      </Button>
    </form>
  );
}
