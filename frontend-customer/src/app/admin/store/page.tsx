"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Package, Plus, Receipt, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PageState } from "@/components/ui/page-state";
import { NavLink } from "@/components/ui/nav-link";
import { clientFetch } from "@/lib/api-client";
import { KIND_ROUTES } from "@/lib/focus/kinds";
import { billingIntervalSuffix } from "@/lib/billing-interval";
import { formatDate, formatMoney } from "@/lib/format";
import { useAsyncAction } from "@shared/hooks/use-async-action";

const STORE_TABS = ["products", "bundles", "plans", "payments"];

interface Product {
  id: number;
  title: string;
  type: string;
  price: string;
  currency: string;
  /** False for a draft (a download or bundle she has not published). */
  is_active: boolean;
  sales_count?: number;
}

interface BundleListItem {
  id: number;
  name: string;
  price: string;
  currency: string;
  item_count: number;
  is_active: boolean;
  is_published: boolean;
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
    onsite_event: "outline",
    bundle: "default",
  };
  const labelMap: Record<string, string> = {
    course: "Course",
    download: "Download",
    live_class: "Live Class",
    live_stream: "Live Stream",
    onsite_event: "In-Person Class",
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
                  <td className="px-4 py-3 font-medium">
                    {p.title}
                    {/* Hidden from students until she publishes it. */}
                    {!p.is_active && (
                      <Badge variant="outline" className="ml-2">
                        Draft
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.price} {p.currency}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.sales_count ?? 0}
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

// Focus mode where the overview lists bundles (the owner's), else the plain form.
const NEW_BUNDLE = KIND_ROUTES.bundle?.newHref ?? "/admin/store/bundles/new";

function BundlesTab() {
  const t = useTranslations("admin.store.bundles");
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
          <NavLink href={NEW_BUNDLE}>
            <Plus className="h-4 w-4" />
            {t("new")}
          </NavLink>
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
                        label: t("new"),
                        href: NEW_BUNDLE,
                      }}
                    />
                  </td>
                </tr>
              ) : (
                bundles.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{b.name}</td>
                    <td className="px-4 py-3">
                      {formatMoney(b.price, b.currency)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.item_count}
                    </td>
                    <td className="px-4 py-3">
                      {b.is_published ? (
                        <Badge variant={b.is_active ? "success" : "secondary"}>
                          {b.is_active ? "Active" : "Inactive"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t("draft")}</Badge>
                      )}
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

// Focus mode where the overview lists memberships (the owner's), else the plain form.
const NEW_PLAN = KIND_ROUTES.membership?.newHref ?? "/admin/store/plans/new";

function PlansTab() {
  const t = useTranslations("admin.store.plans");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // ?all=1: the ones she switched off too, so she can switch them back on.
    clientFetch<Plan[]>("/api/v1/billing/plans/?all=1")
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild className="gap-2">
          <NavLink href={NEW_PLAN}>
            <Plus className="h-4 w-4" />
            {t("new")}
          </NavLink>
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
                      title={t("empty")}
                      description={t("emptyHint")}
                      action={{
                        label: t("new"),
                        href: NEW_PLAN,
                      }}
                    />
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">
                      {formatMoney(p.price, p.currency)}
                      {billingIntervalSuffix(p.billing_interval_months)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.is_active ? "success" : "secondary"}>
                        {t(p.is_active ? "on" : "off")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button asChild variant="ghost" size="sm">
                        <NavLink href={`/admin/store/plans/${p.id}`}>
                          {t("editRow")}
                        </NavLink>
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

interface Sale {
  id: number;
  payment_type: string;
  status: string;
  amount: string;
  currency: string;
  created_at: string;
  receipt_url: string;
  items: Array<{ id: number; title: string }>;
  student: { id: number; name: string; email: string };
}

interface SalesPage {
  count: number;
  next: string | null;
  results: Sale[];
}

const SALE_STATUS_VARIANT: Record<
  string,
  "success" | "secondary" | "warning" | "outline"
> = {
  completed: "success",
  pending: "outline",
  failed: "secondary",
  refunded: "secondary",
  partially_refunded: "warning",
};

const SALES_PAGE = 20;

/** Everything students paid her, newest first. Refunds are made from the
 *  student's own page, which each row links to. */
function SalesTab() {
  const t = useTranslations("admin.store.payments");
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchSales = (offset: number) =>
    clientFetch<SalesPage>(
      `/api/v1/billing/sales/?limit=${SALES_PAGE}&offset=${offset}`,
    );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSales(0)
      .then((page) => {
        if (cancelled) return;
        setSales(page.results);
        setTotal(page.count);
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

  const { run: loadMore, loading: loadingMore } = useAsyncAction(async () => {
    const page = await fetchSales(sales.length);
    setSales((current) => [...current, ...page.results]);
    setTotal(page.count);
  });

  const tableHead = (
    <thead>
      <tr className="border-b bg-muted/50">
        <th className="px-4 py-3 text-left font-medium">{t("date")}</th>
        <th className="px-4 py-3 text-left font-medium">{t("student")}</th>
        <th className="px-4 py-3 text-left font-medium">{t("what")}</th>
        <th className="px-4 py-3 text-left font-medium">{t("amount")}</th>
        <th className="px-4 py-3 text-left font-medium">{t("status")}</th>
        <th className="px-4 py-3 text-left font-medium">
          <span className="sr-only">{t("receipt")}</span>
        </th>
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
              <TableSkeletonRows cols={6} />
            </tbody>
          </table>
        </div>
      }
    >
      {sales.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t("empty")}
          description={t("emptyHint")}
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              {tableHead}
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(sale.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <NavLink
                        href={`/admin/students/${sale.student.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {sale.student.name || sale.student.email}
                      </NavLink>
                    </td>
                    <td className="px-4 py-3">
                      {sale.items.length
                        ? sale.items.map((item) => item.title).join(", ")
                        : t("membershipCharge")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {formatMoney(sale.amount, sale.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={SALE_STATUS_VARIANT[sale.status] ?? "outline"}
                      >
                        {t(`statuses.${sale.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sale.receipt_url && (
                        <a
                          href={sale.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          {t("receipt")}
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("refundHint")}</p>
            {sales.length < total && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                loading={loadingMore}
                loadingText={t("loading")}
              >
                {t("more")}
              </Button>
            )}
          </div>
        </div>
      )}
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
        {/* Four tabs are wider than a phone: let them wrap. */}
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="products">{t("store.tabs.products")}</TabsTrigger>
          <TabsTrigger value="bundles">{t("store.tabs.bundles")}</TabsTrigger>
          <TabsTrigger value="plans">{t("store.tabs.plans")}</TabsTrigger>
          <TabsTrigger value="payments">{t("store.tabs.payments")}</TabsTrigger>
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
        <TabsContent value="payments">
          <SalesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
