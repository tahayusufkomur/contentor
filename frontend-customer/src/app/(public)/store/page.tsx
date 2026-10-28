"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

const FILTER_BUTTONS = [
  { value: "all", labelKey: "filter.all" },
  { value: "course", labelKey: "store.filter.courses" },
  { value: "download", labelKey: "store.filter.downloads" },
  { value: "live_class", labelKey: "store.filter.liveSessions" },
  { value: "live_stream", labelKey: "store.filter.liveStreams" },
  { value: "onsite_event", labelKey: "store.filter.inPersonEvents" },
  { value: "bundle", labelKey: "store.filter.bundles" },
] as const satisfies readonly { value: FilterType; labelKey: string }[];

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
  const t = useTranslations("site");
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  // A new `t` (messages refreshed) must not refetch the list.
  const tRef = useRef(t);
  tRef.current = t;

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
      toast.error(tRef.current("store.loadFailed"));
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
    toast.success(t("store.addedToCart", { title: item.title }));
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
          {t("store.title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("store.text")}</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <Input
          placeholder={t("store.searchItems")}
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
        {FILTER_BUTTONS.map(({ value, labelKey }) => (
          <Button
            key={value}
            variant={filter === value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(value)}
          >
            {t(labelKey)}
          </Button>
        ))}
      </div>

      {/* Subscription Plans */}
      {plans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">
            {t("store.subscriptionPlans")}
          </h2>
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
            title={t("store.noItems")}
            description={t("store.noItemsText")}
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
      toast.success(t("store.subscribed"));
      onSubscribed();
    },
    {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 403) {
          navigate(
            `/login?toast=${encodeURIComponent(t("plan.loginToSubscribe"))}&toast_type=info`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 400) {
          toast.info(t("store.alreadySubscribed"));
          return;
        }
        toast.error(
          err instanceof Error ? err.message : t("plan.subscriptionFailed"),
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
          {t("plan.subscribe")}
        </Button>
      </CardContent>
    </Card>
  );
}
