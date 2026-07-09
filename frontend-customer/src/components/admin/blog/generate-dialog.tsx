"use client";

import { useEffect, useState } from "react";

import { Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  type BlogPostAdmin,
  type TopicIdea,
  dismissTopic,
  generatePost,
  listTopics,
  refillTopics,
} from "@/lib/blog-api";

interface GenerateDialogProps {
  onClose: () => void;
  onGenerated: (post: BlogPostAdmin) => void;
}

export function GenerateDialog({ onClose, onGenerated }: GenerateDialogProps) {
  const t = useTranslations("admin");
  const [topics, setTopics] = useState<TopicIdea[] | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [customTopic, setCustomTopic] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTopics()
      .then(async (list) => {
        if (cancelled) return;
        if (list.length === 0) {
          const res = await refillTopics();
          if (!cancelled) setTopics(res.topics);
        } else {
          setTopics(list);
        }
      })
      .catch(() => setTopics([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const removeTopic = async (id: number) => {
    setTopics((prev) => prev?.filter((t) => t.id !== id) ?? null);
    if (selectedTopicId === id) setSelectedTopicId(null);
    dismissTopic(id).catch(() => {});
  };

  const handleGenerate = async () => {
    if (!selectedTopicId && !customTopic.trim()) return;
    setGenerating(true);
    try {
      const res = await generatePost({
        topic_id: selectedTopicId ?? undefined,
        custom_topic: selectedTopicId ? undefined : customTopic.trim(),
        instructions: instructions.trim() || undefined,
      });
      if (res.source === "ai" && res.post) {
        onGenerated(res.post);
        return;
      }
      const errKey =
        res.source === "quota_exhausted"
          ? "blog.errQuota"
          : res.source === "budget" || res.source === "disabled"
            ? "blog.errBudget"
            : "blog.errGeneric";
      toast.error(t(errKey));
    } catch {
      toast.error(t("blog.errGeneric"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4"
        onClick={!generating ? onClose : undefined}
      >
        <div
          className="flex w-full max-w-lg flex-col gap-4 rounded-xl border bg-background p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("blog.generateTitle")}
            </h2>
            {!generating && (
              <button
                onClick={onClose}
                className="rounded p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {generating ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Sparkles className="h-6 w-6 animate-pulse text-primary" />
              <p className="text-sm text-muted-foreground">
                {t("blog.generating")}
              </p>
            </div>
          ) : (
            <>
              {topics === null ? (
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-8 w-28" />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => {
                        setSelectedTopicId(topic.id);
                        setCustomTopic("");
                      }}
                      className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                        selectedTopicId === topic.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-accent"
                      }`}
                      title={topic.angle}
                    >
                      {topic.title}
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTopic(topic.id);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("blog.topicYourOwn")}
                </label>
                <input
                  value={customTopic}
                  onChange={(e) => {
                    setCustomTopic(e.target.value);
                    setSelectedTopicId(null);
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder={t("blog.topicYourOwn")}
                />
              </div>

              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t("blog.instructionsPlaceholder")}
                rows={2}
              />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedTopicId && !customTopic.trim()}
                  onClick={handleGenerate}
                >
                  <Sparkles className="h-4 w-4" />
                  {t("blog.writeWithAi")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
