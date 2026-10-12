"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PageState } from "@/components/ui/page-state";
import { clientFetch } from "@/lib/api-client";
import {
  ContentPicker,
  type SelectedItem,
} from "@/components/billing/content-picker";
import { useAsyncAction } from "@shared/hooks/use-async-action";

/** One piece of content, as GET returns it and PUT takes it back. */
interface PlanContent {
  content_type: string;
  object_id: number;
  title: string;
  price: string;
  pricing_type: string;
}

/** GET and PUT /billing/plans/<id>/access/ both answer with this. */
interface PlanAccess {
  plan: { id: number; name: string; is_active: boolean };
  items: PlanContent[];
  available: PlanContent[];
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export default function PlanAccessPage() {
  const params = useParams();
  const id = params.id as string;

  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    async function load() {
      try {
        const data = await clientFetch<PlanAccess>(
          `/api/v1/billing/plans/${id}/access/`,
        );
        if (cancelled) return;
        setAccess(data);
        setSelectedItems(data.items);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        toast.error("Failed to load plan access data.");
        setLoadError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const products = useMemo(
    () =>
      (access?.available ?? []).map((item) => ({
        id: item.object_id,
        type: item.content_type,
        title: item.title,
        price: item.price,
        pricing_type: item.pricing_type,
      })),
    [access],
  );

  const { run: handleSave, loading: saving } = useAsyncAction(
    async () => {
      const saved = await clientFetch<PlanAccess>(
        `/api/v1/billing/plans/${id}/access/`,
        {
          method: "PUT",
          body: JSON.stringify({
            items: selectedItems.map((i) => ({
              content_type: i.content_type,
              object_id: i.object_id,
            })),
          }),
        },
      );
      setAccess(saved);
      setSelectedItems(saved.items);
      toast.success("Plan access updated successfully.");
    },
    { errorToast: "Failed to update plan access. Please try again." },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/billing">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {access
              ? `Manage Access: ${access.plan.name}`
              : "Manage Plan Access"}
            {access && !access.plan.is_active && (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose which content subscribers of this plan can access.
          </p>
        </div>
      </div>

      <PageState
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Content Access
              </CardTitle>
              <CardDescription>
                Select the courses, downloads, live classes, live streams, and
                on-site events included in this subscription plan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoadingSkeleton />
            </CardContent>
          </Card>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Content Access
            </CardTitle>
            <CardDescription>
              Select the courses, downloads, live classes, live streams, and
              on-site events included in this subscription plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContentPicker
              selected={selectedItems}
              onChange={setSelectedItems}
              products={products}
            />
          </CardContent>
        </Card>
      </PageState>

      <Separator />

      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          loading={saving}
          loadingText="Saving…"
          disabled={loading}
        >
          Save Access
        </Button>
        <Button variant="outline" asChild>
          <Link href="/admin/billing">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}
