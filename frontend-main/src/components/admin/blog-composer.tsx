"use client";

import { useState } from "react";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  generatePlatformPost,
  type PlatformBlogPostAdmin,
} from "@/lib/platform-blog-admin";

export function BlogComposer({
  onGenerated,
}: {
  onGenerated: (post: PlatformBlogPostAdmin) => void;
}) {
  const [topic, setTopic] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await generatePlatformPost({
        topic: topic.trim(),
        instructions: instructions.trim() || undefined,
      });
      if (res.source === "ai" && res.post) {
        onGenerated(res.post);
        setTopic("");
        setInstructions("");
      } else if (res.source === "budget") {
        setError(
          "AI writing is temporarily unavailable (monthly budget reached).",
        );
      } else {
        setError("Something went wrong generating the post.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        Write with AI
      </h2>
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic (e.g. Why coaches need their own website)"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Anything specific you want it to cover? (optional)"
        rows={2}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        size="sm"
        loading={generating}
        disabled={!topic.trim()}
        onClick={generate}
      >
        <Sparkles className="h-4 w-4" />
        Generate draft
      </Button>
      {generating && (
        <p className="text-xs text-muted-foreground">
          Writing your post — this takes about half a minute…
        </p>
      )}
    </div>
  );
}
