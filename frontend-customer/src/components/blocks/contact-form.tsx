"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientFetch } from "@/lib/api-client";
import { useAsyncAction } from "@shared/hooks/use-async-action";

/** The site's contact form (POST /api/v1/contact/, honeypot-protected).
 *  Shared by the legacy contact block and every style's contact section. */
export function ContactForm({
  successMessage,
  submitLabel,
  className,
  buttonClassName,
  inputClassName,
  successClassName,
}: {
  successMessage?: string;
  submitLabel?: string;
  className?: string;
  buttonClassName?: string;
  /** Extra classes on every input/textarea (styles restyle the fields). */
  inputClassName?: string;
  /** Replaces the default success panel classes. */
  successClassName?: string;
}) {
  const [sent, setSent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const thanks = successMessage || "Thanks! We'll be in touch soon.";

  const { run: handleSubmit, loading: submitting } = useAsyncAction(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const payload = {
        name: (form.elements.namedItem("name") as HTMLInputElement).value,
        email: (form.elements.namedItem("email") as HTMLInputElement).value,
        message: (form.elements.namedItem("message") as HTMLTextAreaElement)
          .value,
        website, // honeypot — should stay empty
      };
      await clientFetch("/api/v1/contact/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSent(true);
      toast.success(thanks);
      form.reset();
    },
    { errorToast: "Something went wrong. Please try again." },
  );

  if (sent) {
    return (
      <div
        className={cn(
          successClassName ?? "rounded-xl border bg-brand-surface p-8 text-center",
          className,
        )}
      >
        <p className="font-medium">{thanks}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div className="space-y-1.5">
        <Label htmlFor="contact-name">Name</Label>
        <Input
          id="contact-name"
          name="name"
          required
          placeholder="Your name"
          className={inputClassName}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className={inputClassName}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-message">Message</Label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          placeholder="How can we help?"
          className={cn(
            "w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            inputClassName,
          )}
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
      <Button
        type="submit"
        className={cn("w-full gap-2", buttonClassName)}
        loading={submitting}
        loadingText="Sending…"
      >
        {submitLabel || "Send message"}
      </Button>
    </form>
  );
}
