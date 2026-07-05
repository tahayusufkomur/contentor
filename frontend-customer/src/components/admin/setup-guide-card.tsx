"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronRight,
  Paintbrush,
  Rocket,
  Wallet,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { clientFetch } from "@/lib/api-client";

interface SetupStatus {
  site_customized: boolean;
  has_content: boolean;
  payments_ready: boolean;
  published: boolean;
  dismissed: boolean;
}

const STEPS = [
  {
    key: "site_customized" as const,
    icon: Paintbrush,
    title: "Make it yours",
    description: "Change the words, photos and colors on your site.",
    href: "/",
  },
  {
    key: "has_content" as const,
    icon: BookOpen,
    title: "Add your first course or download",
    description: "Give your students something to learn from.",
    href: "/admin/courses/new",
  },
  {
    key: "payments_ready" as const,
    icon: Wallet,
    title: "Set up how you get paid",
    description: "Connect payouts so students can buy from you.",
    href: "/admin/payouts",
  },
  {
    key: "published" as const,
    icon: Rocket,
    title: "Publish your site",
    description: "Flip the switch when you are ready for the world.",
    href: "#publish-card",
  },
];

export function SetupGuideCard() {
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    clientFetch<SetupStatus>("/api/v1/admin/setup-status/")
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (!status) return null;

  const setDismissed = (dismissed: boolean) => {
    setStatus({ ...status, dismissed });
    clientFetch("/api/v1/admin/setup-status/", {
      method: "PATCH",
      body: JSON.stringify({ dismissed }),
    }).catch(() => {});
  };

  if (status.dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Show setup guide
      </button>
    );
  }

  const done = STEPS.filter((s) => status[s.key]).length;
  const allDone = done === STEPS.length;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {allDone ? "You’re live! 🎉" : "Get your studio live"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {allDone
                ? "Everything is set up. Share your site with your students!"
                : `${done} of ${STEPS.length} steps done`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss setup guide"
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(done / STEPS.length) * 100}%` }}
          />
        </div>

        <ul className="space-y-1">
          {STEPS.map((step) => {
            const isDone = status[step.key];
            const Icon = step.icon;
            return (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50 ${
                    isDone ? "opacity-60" : ""
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      isDone
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-medium ${isDone ? "line-through" : ""}`}
                    >
                      {step.title}
                    </span>
                    {!isDone && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {step.description}
                      </span>
                    )}
                  </span>
                  {!isDone && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
