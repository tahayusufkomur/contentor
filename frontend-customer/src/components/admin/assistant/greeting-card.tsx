"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_SUGGESTIONS = 3;

/** Greeting + suggested-question editor. Seeded once from the loaded config
 * (uncontrolled after mount, same pattern as the plain settings page) so an
 * unrelated save elsewhere (e.g. the enable switch) never clobbers in-progress
 * edits here. */
export function GreetingCard({
  initialGreeting,
  initialSuggestions,
  onSave,
}: {
  initialGreeting: string;
  initialSuggestions: string[];
  onSave: (greeting: string, suggestions: string[]) => Promise<void>;
}) {
  const t = useTranslations("admin");
  const [greeting, setGreeting] = useState(initialGreeting);
  const [suggestions, setSuggestions] = useState<string[]>(() => {
    const padded = [...initialSuggestions];
    while (padded.length < MAX_SUGGESTIONS) padded.push("");
    return padded.slice(0, MAX_SUGGESTIONS);
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        greeting.trim(),
        suggestions.map((s) => s.trim()).filter(Boolean),
      );
      toast.success(t("assistant.saved"));
    } catch {
      toast.error(t("assistant.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistant.greetingLabel")}</CardTitle>
        <CardDescription>{t("assistant.greetingHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="assistant-greeting">
            {t("assistant.greetingLabel")}
          </Label>
          <Input
            id="assistant-greeting"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            maxLength={200}
            placeholder={t("assistant.greetingPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label id="assistant-suggestions-label">
            {t("assistant.suggestionsLabel")}
          </Label>
          <div
            className="space-y-2"
            role="group"
            aria-labelledby="assistant-suggestions-label"
          >
            {suggestions.map((suggestion, index) => (
              <Input
                key={index}
                id={`assistant-suggestion-${index}`}
                name={`assistant-suggestion-${index}`}
                value={suggestion}
                onChange={(e) => {
                  const next = [...suggestions];
                  next[index] = e.target.value;
                  setSuggestions(next);
                }}
                maxLength={80}
                placeholder={t("assistant.suggestionPlaceholder")}
                aria-label={`${t("assistant.suggestionsLabel")} ${index + 1}`}
              />
            ))}
          </div>
        </div>
        <Button onClick={() => void handleSave()} loading={saving}>
          {t("assistant.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
