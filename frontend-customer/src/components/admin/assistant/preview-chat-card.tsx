"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { ArrowRight, Send } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { streamAssistantPreview, type ChatMessage } from "@/lib/assistant";

import { parseAnswer } from "./format-answer";

/** "Try it yourself" — a mini chat that hits the preview-chat endpoint
 * directly, bypassing the enable switch and the monthly question quota, so
 * the coach can sanity-check answers before turning the assistant on. */
export function PreviewChatCard() {
  const t = useTranslations("admin");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError(false);
    setInput("");
    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      await streamAssistantPreview(history, (delta) => {
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          next[next.length - 1] = {
            role: "assistant",
            content: last.content + delta,
          };
          return next;
        });
      });
    } catch {
      setMessages(history.slice(0, -1));
      setInput(trimmed);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistant.previewTitle")}</CardTitle>
        <CardDescription>{t("assistant.previewHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-80 flex-col overflow-hidden rounded-xl border">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((message, index) => {
              if (message.role === "user") {
                return (
                  <div key={index} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {message.content}
                    </div>
                  </div>
                );
              }
              const parsed = message.content
                ? parseAnswer(message.content)
                : null;
              return (
                <div key={index} className="flex">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm">
                    {parsed ? (
                      <>
                        <p className="whitespace-pre-wrap">{parsed.text}</p>
                        {parsed.links.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {parsed.links.map(({ label, href }) => (
                              <Link
                                key={href + label}
                                href={href}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                {label}
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      t("assistant.previewThinking")
                    )}
                  </div>
                </div>
              );
            })}
            {error && (
              <p className="text-center text-xs text-destructive">
                {t("assistant.previewError")}
              </p>
            )}
          </div>
          <form
            className="flex items-center gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              id="assistant-preview-input"
              name="assistant-preview-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("assistant.previewPlaceholder")}
              aria-label={t("assistant.previewPlaceholder")}
              maxLength={2000}
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label={t("assistant.previewSend")}
              className="rounded-md bg-primary p-2 text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
