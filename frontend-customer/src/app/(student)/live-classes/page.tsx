"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { clientFetch } from "@/lib/api-client";
import {
  Video,
  Radio,
  Clock,
  Calendar,
  Play,
  CheckCircle2,
} from "lucide-react";

interface LiveClass {
  id: number;
  title: string;
  description: string;
  status: string;
  pricing_type: string;
  price: string;
  recording_url: string;
  recording_signed_url: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  scheduled: {
    label: "Upcoming",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <Calendar className="h-3 w-3" />,
  },
  live: {
    label: "Live Now",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: <Radio className="h-3 w-3 animate-pulse" />,
  },
  ended: {
    label: "Ended",
    color:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LiveClassesPage() {
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    clientFetch<LiveClass[]>("/api/v1/live/")
      .then(setClasses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const liveNow = classes.filter((c) => c.status === "live");
  const upcoming = classes.filter((c) => c.status === "scheduled");
  const past = classes.filter((c) => c.status === "ended");

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Video className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Live Classes</h1>
      </div>

      {/* Live now banner */}
      {liveNow.length > 0 && (
        <div className="space-y-3">
          {liveNow.map((lc) => (
            <div
              key={lc.id}
              className="flex items-center justify-between rounded-lg border-2 border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-400">
                  <Radio className="h-3 w-3 animate-pulse" />
                  Live Now
                </div>
                <div>
                  <p className="font-semibold">{lc.title}</p>
                  {lc.description && (
                    <p className="text-sm text-muted-foreground">
                      {lc.description}
                    </p>
                  )}
                </div>
              </div>
              <Button asChild size="sm" className="gap-1.5">
                <Link href={`/live/${lc.id}`}>
                  <Play className="h-3.5 w-3.5" />
                  Join
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setTab("upcoming")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "upcoming"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Upcoming ({upcoming.length})
        </button>
        <button
          onClick={() => setTab("past")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "past"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Past ({past.length})
        </button>
      </div>

      {tab === "upcoming" && (
        <>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No upcoming classes"
              description="There are no scheduled live classes at the moment. Check back later!"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((lc) => (
                <Card key={lc.id} className="overflow-hidden">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig.scheduled.color}`}
                      >
                        {statusConfig.scheduled.icon}
                        {statusConfig.scheduled.label}
                      </span>
                      {lc.pricing_type === "free" ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Free
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          ${parseFloat(lc.price).toFixed(0)}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold">{lc.title}</h3>
                    {lc.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {lc.description}
                      </p>
                    )}
                    {lc.scheduled_at && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(lc.scheduled_at)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "past" && (
        <>
          {past.length === 0 ? (
            <EmptyState
              icon={Video}
              title="No past classes"
              description="No previous live classes to show yet."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((lc) => (
                <Card key={lc.id} className="overflow-hidden">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig.ended.color}`}
                      >
                        {statusConfig.ended.icon}
                        {statusConfig.ended.label}
                      </span>
                    </div>
                    <h3 className="font-semibold">{lc.title}</h3>
                    {lc.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {lc.description}
                      </p>
                    )}
                    {lc.ended_at && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(lc.ended_at)}
                      </div>
                    )}
                    {(lc.recording_signed_url || lc.recording_url) && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                      >
                        <Link
                          href={lc.recording_signed_url || lc.recording_url}
                          target="_blank"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Watch Recording
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
