"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ArrowRight, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listTranscripts, type TranscriptRow } from "@/lib/assistant";

import { parseAnswer } from "./format-answer";

// Rough heuristic for whether the 3-line clamp actually truncates the
// answer — good enough to decide whether to show "Show more", no DOM
// measurement needed.
const CLAMP_THRESHOLD = 180;

/** The coach's audit log: what visitors/students asked the site assistant
 * and what the coach asked "Ask Contentor" (Task 8's help bot) — same
 * AiTranscript table, scoped server-side to this tenant. Each row can seed a
 * new knowledge entry ("Add to knowledge"), closing the improvement loop. */
export function TranscriptsCard({
  onAddToKnowledge,
}: {
  onAddToKnowledge: (question: string) => void;
}) {
  const t = useTranslations("admin");
  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Explicit origin, not read inline at each call site — keeps `parseAnswer`
  // SSR-safe (it never touches `window` itself) and gives every extracted
  // link a real same-origin check via the `URL` parser. See format-answer.ts.
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    listTranscripts(1)
      .then((r) => {
        setRows(r.results);
        setHasMore(r.has_more);
      })
      .catch(() => toast.error(t("assistant.loadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await listTranscripts(next);
      setRows((current) => [...current, ...r.results]);
      setHasMore(r.has_more);
      setPage(next);
    } catch {
      toast.error(t("assistant.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistant.transcriptsTitle")}</CardTitle>
        <CardDescription>{t("assistant.transcriptsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("assistant.empty")}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {rows.map((row) => {
              const isExpanded = expanded.has(row.id);
              const { text: answer, links } = parseAnswer(row.answer, origin);
              return (
                <div key={row.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant={
                        row.feature === "student_bot" ? "brand" : "outline"
                      }
                    >
                      {t(
                        row.feature === "student_bot"
                          ? "assistant.transcriptSourceSite"
                          : "assistant.transcriptSourceHelp",
                      )}
                    </Badge>
                    {row.is_preview && (
                      <Badge variant="secondary">
                        {t("assistant.transcriptPreviewBadge")}
                      </Badge>
                    )}
                    {row.rating === "up" && (
                      <span title={t("assistant.ratingUp")}>
                        <ThumbsUp className="h-3.5 w-3.5 text-primary" />
                      </span>
                    )}
                    {row.rating === "down" && (
                      <span title={t("assistant.ratingDown")}>
                        <ThumbsDown className="h-3.5 w-3.5 text-destructive" />
                      </span>
                    )}
                    <span>{new Date(row.created_at).toLocaleString()}</span>
                  </div>
                  <p className="font-medium">{row.question}</p>
                  <p
                    className={
                      isExpanded
                        ? "whitespace-pre-wrap text-muted-foreground"
                        : "line-clamp-3 whitespace-pre-wrap text-muted-foreground"
                    }
                  >
                    {answer}
                  </p>
                  {links.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {links.map(({ label, href }) => (
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
                  <div className="flex items-center gap-3">
                    {answer.length > CLAMP_THRESHOLD && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(row.id)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {isExpanded
                          ? t("assistant.showLess")
                          : t("assistant.showMore")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddToKnowledge(row.question)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {t("assistant.addToKnowledge")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadMore()}
            loading={loadingMore}
          >
            {t("assistant.loadMore")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
