"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Package, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PageState } from "@/components/ui/page-state";
import { clientFetch } from "@/lib/api-client";
import { billingIntervalSuffix } from "@/lib/billing-interval";

const STORE_TABS = ["products", "bundles", "plans"];

interface Product {
  id: number;
  title: string;
  type: string;
  price: string;
  currency: string;
  sales?: number;
}

interface BundleListItem {
  id: number;
  name: string;
  price: string;
  item_count: number;
  is_active: boolean;
}

interface Plan {
  id: number;
  name: string;
  price: string;
  currency: string;
  billing_interval_months?: number;
  is_active: boolean;
}

function ProductTypeBadge({ type }: { type: string }) {
  const variantMap: Record<
    string,
    "default" | "secondary" | "outline" | "success" | "warning" | "brand"
  > = {
    course: "brand",
    download: "secondary",
    live_class: "warning",
    live_stream: "success",
    bundle: "default",
  };
  const labelMap: Record<string, string> = {
    course: "Course",
    download: "Download",
    live_class: "Live Class",
    live_stream: "Live Stream",
    bundle: "Bundle",
  };
  return (
    <Badge variant={variantMap[type] ?? "outline"}>
      {labelMap[type] ?? type}
    </Badge>
  );
}

function TableSkeletonRows({
  cols,
  rows = 5,
}: {
  cols: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    clientFetch<Product[]>("/api/v1/billing/products/")
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Price</th>
                <th className="px-4 py-3 text-left font-medium">Sales</th>
              </tr>
            </thead>
            <tbody>
              <TableSkeletonRows cols={4} />
            </tbody>
          </table>
        </div>
      }
    >
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Title</th>
              <th className="px-4 py-3 text-left font-medium">Price</th>
              <th className="px-4 py-3 text-left font-medium">Sales</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No products found.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <ProductTypeBadge type={p.type} />
                  </td>
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className="px-4 py-3">
                    {p.price} {p.currency}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.sales ?? 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageState>
  );
}

function BundlesTab() {
  const [bundles, setBundles] = useState<BundleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    clientFetch<BundleListItem[]>("/api/v1/billing/bundles/")
      .then((data) => {
        if (!cancelled) setBundles(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const tableHead = (
    <thead>
      <tr className="border-b bg-muted/50">
        <th className="px-4 py-3 text-left font-medium">Name</th>
        <th className="px-4 py-3 text-left font-medium">Price</th>
        <th className="px-4 py-3 text-left font-medium">Items</th>
        <th className="px-4 py-3 text-left font-medium">Status</th>
        <th className="px-4 py-3 text-left font-medium">Actions</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild className="gap-2">
          <Link href="/admin/store/bundles/new">
            <Plus className="h-4 w-4" />
            Create Bundle
          </Link>
        </Button>
      </div>
      <PageState
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={
          <div className="rounded-md border">
            <table className="w-full text-sm">
              {tableHead}
              <tbody>
                <TableSkeletonRows cols={5} />
              </tbody>
            </table>
          </div>
        }
      >
        <div className="rounded-md border">
          <table className="w-full text-sm">
            {tableHead}
            <tbody>
              {bundles.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={Package}
                      title="No bundles yet"
                      description="Create a bundle to group products at a discounted price."
                      action={{
                        label: "Create Bundle",
                        href: "/admin/store/bundles/new",
                      }}
                    />
                  </td>
                </tr>
              ) : (
                bundles.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{b.name}</td>
                    <td className="px-4 py-3">${b.price}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.item_count}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={b.is_active ? "success" : "secondary"}>
                        {b.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/store/bundles/${b.id}`}>Edit</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageState>
    </div>
  );
}

function PlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    clientFetch<Plan[]>("/api/v1/billing/plans/")
      .then((data) => {
        if (!cancelled) setPlans(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const tableHead = (
    <thead>
      <tr className="border-b bg-muted/50">
        <th className="px-4 py-3 text-left font-medium">Name</th>
        <th className="px-4 py-3 text-left font-medium">Price</th>
        <th className="px-4 py-3 text-left font-medium">Status</th>
        <th className="px-4 py-3 text-left font-medium">Actions</th>
      </tr>
    </thead>
  );

  return (
    <PageState
      loading={loading}
      error={error}
      onRetry={() => setReloadKey((k) => k + 1)}
      skeleton={
        <div className="rounded-md border">
          <table className="w-full text-sm">
            {tableHead}
            <tbody>
              <TableSkeletonRows cols={4} />
            </tbody>
          </table>
        </div>
      }
    >
      <div className="rounded-md border">
        <table className="w-full text-sm">
          {tableHead}
          <tbody>
            {plans.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={Settings}
                    title="No subscription plans"
                    description="Subscription plans will appear here once created."
                  />
                </td>
              </tr>
            ) : (
              plans.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.price} {p.currency}
                    {billingIntervalSuffix(p.billing_interval_months)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.is_active ? "success" : "secondary"}>
                      {p.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/store/plans/${p.id}`}>
                        Manage Access
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageState>
  );
}

export default function StorePage() {
  const t = useTranslations("admin");
  const tabParam = useSearchParams().get("tab");
  const tab = tabParam && STORE_TABS.includes(tabParam) ? tabParam : "products";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("nav.items.store")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("store.subtitle")}</p>
      </div>
      {/* key remounts the tabs when ?tab= changes under the same page. */}
      <Tabs defaultValue={tab} key={tab}>
        <TabsList>
          <TabsTrigger value="products">{t("store.tabs.products")}</TabsTrigger>
          <TabsTrigger value="bundles">{t("store.tabs.bundles")}</TabsTrigger>
          <TabsTrigger value="plans">{t("store.tabs.plans")}</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="bundles">
          <BundlesTab />
        </TabsContent>
        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
