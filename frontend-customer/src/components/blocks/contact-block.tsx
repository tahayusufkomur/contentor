"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientFetch } from "@/lib/api-client";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function ContactBlock({ data }: BlockComponentProps) {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
      website, // honeypot — should stay empty
    };
    setSubmitting(true);
    try {
      await clientFetch("/api/v1/contact/", { method: "POST", body: JSON.stringify(payload) });
      setSent(true);
      toast.success(data.successMessage || "Thanks! We'll be in touch soon.");
      form.reset();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="py-16">
      <div className="mx-auto max-w-xl px-4">
        {data.heading && (
          <h2 className="text-center font-display text-3xl font-bold tracking-tight">{data.heading}</h2>
        )}
        {data.intro && <p className="mt-3 text-center text-muted-foreground">{data.intro}</p>}

        {sent ? (
          <div className="mt-8 rounded-xl border bg-brand-surface p-8 text-center">
            <p className="font-medium">{data.successMessage || "Thanks! We'll be in touch soon."}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Name</Label>
              <Input id="contact-name" name="name" required placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" name="email" type="email" required placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-message">Message</Label>
              <textarea
                id="contact-message"
                name="message"
                required
                rows={5}
                placeholder="How can we help?"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
            </div>
            {/* Honeypot: visually hidden, off-screen; bots fill it, humans don't. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />
            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {data.submitLabel || "Send message"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
