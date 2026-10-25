"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ReelEditor } from "@/components/admin/reels/reel-editor";
import { ReelEditorSkeleton } from "@/components/admin/reels/reel-editor-skeleton";
import { PageState } from "@/components/ui/page-state";
import { getReel } from "@/lib/reels-api";
import type { ReelDetail } from "@/types/reels";

export const dynamic = "force-dynamic";

export default function ReelPage() {
  const { id } = useParams<{ id: string }>();
  const [reel, setReel] = useState<ReelDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setReel(null);
    getReel(id)
      .then((found) => !cancelled && setReel(found))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  return (
    <PageState
      loading={!reel && !error}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={<ReelEditorSkeleton />}
    >
      {reel ? <ReelEditor key={reel.id} initial={reel} /> : null}
    </PageState>
  );
}
