"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  BookOpen,
  Download,
  Radio,
  Tv,
  Tag,
  Lock,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageState } from "@/components/ui/page-state";
import { EmptyState } from "@/components/shared/empty-state";
import { StoreItemCard } from "@/components/billing/store-item-card";
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import { addToCart } from "@/lib/cart";
import type { StoreItem, SubscriptionPlan } from "@/types/billing";
import { billingIntervalSuffix } from "@/lib/billing-interval";
import { formatMoney } from "@/lib/format";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useLocale, useTranslations } from "next-intl";

type FilterType =
  | "all"
  | "course"
  | "download"
  | "live_class"
  | "live_stream"
  | "onsite_event"
  | "bundle";

const FILTER_BUTTONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "course", label: "Courses" },
  { value: "download", label: "Downloads" },
  { value: "live_class", label: "Live Sessions" },
  { value: "live_stream", label: "Live Streams" },
  { value: "onsite_event", label: "In-Person Events" },
  { value: "bundle", label: "Bundles" },
];

function StoreCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-44 w-full" />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

function getContentType(type: string): string {
  const map: Record<string, string> = {
    course: "course",
    download: "download",
    live_class: "live_class",
    live_stream: "live_stream",
    onsite_event: "onsite_event",
    bundle: "bundle",
  };
  return map[type] ?? type;
}

export default function StorePage() {
  const router = useRouter();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("type", filter);
      if (search) params.set("search", search);
      const query = params.toString();
      const url = `/api/v1/billing/store/${query ? `?${query}` : ""}`;
      const data = await clientFetch<StoreItem[]>(url);
      setItems(data);
    } catch {
      toast.error("Failed to load store items");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    clientFetch<SubscriptionPlan[]>("/api/v1/billing/plans/")
      .then(setPlans)
      .catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleAddToCart = (item: StoreItem) => {
    setAddingIds((prev) => new Set(prev).add(item.id));
    addToCart({
      content_type: getContentType(item.type),
      object_id: item.id,
      title: item.title,
      price: item.price,
      currency: item.currency,
      type: item.type,
      image: item.thumbnail_url,
    });
    toast.success(`"${item.title}" added to cart`);
    setAddingIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Store
        </h1>
        <p className="mt-1 text-muted-foreground">
          Browse courses, downloads, live sessions, and bundles.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <Input
          placeholder="Search items..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="icon">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {FILTER_BUTTONS.map(({ value, label }) => (
          <Button
            key={value}
            variant={filter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Subscription Plans */}
      {plans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Subscription Plans</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <StorePlanCard
                key={plan.id}
                plan={plan}
                onSubscribed={() => {
                  router.refresh();
                  fetchItems();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <PageState
        loading={loading}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <StoreCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        {items.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No items found"
            description="Try adjusting your search or filter to find what you're looking for."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <StoreItemCard
                key={item.id}
                item={item}
                adding={addingIds.has(item.id)}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}
      </PageState>
    </div>
  );
}

interface StorePlanCardProps {
  plan: SubscriptionPlan;
  onSubscribed: () => void;
}

function StorePlanCard({ plan, onSubscribed }: StorePlanCardProps) {
  const locale = useLocale();
  const t = useTranslations("site");
  const navigate = useNavigate();

  const { run: handleSubscribe, loading: subscribing } = useAsyncAction(
    async () => {
      await clientFetch("/api/v1/billing/subscribe/", {
        method: "POST",
        body: JSON.stringify({ plan_id: plan.id }),
      });
      toast.success("Subscribed! You now have access to plan content.");
      onSubscribed();
    },
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 403) {
          navigate(
            "/login?toast=You+need+to+log+in+to+subscribe&toast_type=info",
          );
          return;
        }
        if (err instanceof ApiError && err.status === 400) {
          toast.info("You're already subscribed to this plan");
          return;
        }
        toast.error(
          err instanceof Error ? err.message : "Subscription failed.",
        );
      },
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        {plan.description && (
          <CardDescription>{plan.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(plan.price, plan.currency, locale)}
          <span className="text-sm font-normal text-muted-foreground">
            {billingIntervalSuffix(plan.billing_interval_months, (k, v) =>
              t(`plan.${k}`, v),
            )}
          </span>
        </p>
        <Button
          className="w-full gap-2"
          loading={subscribing}
          onClick={handleSubscribe}
        >
          <Lock className="h-4 w-4" />
          Subscribe
        </Button>
      </CardContent>
    </Card>
  );
}
