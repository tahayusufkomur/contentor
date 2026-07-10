"use client";

import { useEffect, useState } from "react";

import { MessageCircleQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ConversationsCard } from "@/components/admin/assistant/conversations-card";
import { EnableCard } from "@/components/admin/assistant/enable-card";
import { GreetingCard } from "@/components/admin/assistant/greeting-card";
import {
  KnowledgeCard,
  type KnowledgePrefill,
} from "@/components/admin/assistant/knowledge-card";
import { LinksCard } from "@/components/admin/assistant/links-card";
import { PreviewChatCard } from "@/components/admin/assistant/preview-chat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAssistantConfig,
  putAssistantConfig,
  type AssistantAdminConfig,
} from "@/lib/assistant";

function UpsellCard() {
  const t = useTranslations("admin");
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircleQuestion className="h-5 w-5 text-primary" />
          {t("assistant.upsellTitle")}
        </CardTitle>
        <CardDescription>{t("assistant.upsellBody")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href="/admin/billing">{t("assistant.upsellCta")}</a>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AssistantPage() {
  const t = useTranslations("admin");
  const [config, setConfig] = useState<AssistantAdminConfig | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [prefill, setPrefill] = useState<KnowledgePrefill | null>(null);

  useEffect(() => {
    getAssistantConfig()
      .then(setConfig)
      .catch(() => setLoadError(true));
  }, []);

  const handleToggle = async (next: boolean) => {
    if (!config) return;
    const prev = config;
    setConfig({ ...config, enabled: next });
    try {
      const updated = await putAssistantConfig({ enabled: next });
      setConfig(updated);
    } catch {
      setConfig(prev);
      toast.error(t("assistant.enableFailed"));
    }
  };

  const handleToggleHandoff = async (next: boolean) => {
    if (!config) return;
    const prev = config;
    setConfig({ ...config, human_handoff_enabled: next });
    try {
      const updated = await putAssistantConfig({
        human_handoff_enabled: next,
      });
      setConfig(updated);
    } catch {
      setConfig(prev);
      toast.error(t("assistant.enableFailed"));
    }
  };

  const handleSaveGreeting = async (
    greeting: string,
    suggestions: string[],
  ) => {
    const updated = await putAssistantConfig({
      greeting,
      suggested_questions: suggestions,
    });
    setConfig(updated);
  };

  const handleAddToKnowledge = (question: string) => {
    setPrefill({ title: question.slice(0, 120), content: "" });
    document
      .getElementById("assistant-knowledge")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loadError) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("assistant.loadFailed")}
      </p>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full max-w-2xl" />
        <Skeleton className="h-48 w-full max-w-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("assistant.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("assistant.subtitle")}
        </p>
      </div>

      {config.status.reason === "upgrade_required" ? (
        <UpsellCard />
      ) : (
        <div className="max-w-2xl space-y-6">
          <EnableCard
            config={config}
            onToggle={(v) => void handleToggle(v)}
            onToggleHandoff={(v) => void handleToggleHandoff(v)}
          />
          <GreetingCard
            initialGreeting={config.greeting}
            initialSuggestions={config.suggested_questions}
            onSave={handleSaveGreeting}
          />
          <KnowledgeCard
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(null)}
          />
          <LinksCard />
          <PreviewChatCard />
          <ConversationsCard onAddToKnowledge={handleAddToKnowledge} />
        </div>
      )}
    </div>
  );
}
