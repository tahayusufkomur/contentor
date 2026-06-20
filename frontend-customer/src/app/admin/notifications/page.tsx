"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { clientFetch } from "@/lib/api-client";

export default function BroadcastPage() {
  const t = useTranslations("pushAdmin");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await clientFetch<void>("/api/v1/admin/notifications/broadcast/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      toast.success(t("sent"));
      setMessage("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t("placeholder")}
        rows={4}
        className="w-full rounded-lg border border-border bg-background p-3 text-sm"
      />
      <button
        onClick={send}
        disabled={sending || !message.trim()}
        className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {t("send")}
      </button>
    </div>
  );
}
