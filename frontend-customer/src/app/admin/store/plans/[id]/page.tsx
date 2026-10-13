"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ContentPicker,
  type SelectedItem,
} from "@/components/billing/content-picker";
import { clientFetch } from "@/lib/api-client";
import { useTenantCurrency } from "@/lib/setup-assistant";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

const BACK = "/admin/store?tab=plans";

interface PlanDetail {
  id: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  billing_interval_months: number;
  is_active: boolean;
  items: Array<{ type: string; id: number; title: string }>;
}

/** The plan detail names a content type by its model; the picker and the
 *  access endpoint use the store's own keys. */
const PICKER_TYPE: Record<string, string> = {
  course: "course",
  download: "download",
  liveclass: "live_class",
  livestream: "live_stream",
};

type Cycle = "1" | "12" | "custom";

/** One form for a membership: `/admin/store/plans/new` creates it, a plan's
 *  id edits it. */
export default function PlanPage() {
  const t = useTranslations("admin.store.plans");
  const navigate = useNavigate();
  const id = useParams().id as string;
  const isNew = id === "new";
  const tenantCurrency = useTenantCurrency();

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    is_active: true,
  });
  const [cycle, setCycle] = useState<Cycle>("1");
  const [months, setMonths] = useState("3");
  const [currency, setCurrency] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    clientFetch<PlanDetail>(`/api/v1/billing/plans/${id}/`)
      .then((plan) => {
        if (cancelled) return;
        setForm({
          name: plan.name,
          description: plan.description,
          price: plan.price,
          is_active: plan.is_active,
        });
        const every = plan.billing_interval_months;
        setCycle(every === 1 ? "1" : every === 12 ? "12" : "custom");
        setMonths(String(every));
        setCurrency(plan.currency);
        setSelectedItems(
          plan.items
            .filter((item) => PICKER_TYPE[item.type])
            .map((item) => ({
              content_type: PICKER_TYPE[item.type],
              object_id: item.id,
              title: item.title,
              price: "0",
            })),
        );
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew, reloadKey]);

  // Once created, a second save edits that plan: a plan cannot be deleted,
  // so a retry (the access step failed) must never make another one.
  const savedId = useRef<number | null>(isNew ? null : Number(id));
  // Stays true through the redirect, so the button cannot be pressed twice.
  const [leaving, setLeaving] = useState(false);

  const { run: save, loading: saving } = useAsyncAction(
    async () => {
      const body = JSON.stringify({
        ...form,
        billing_interval_months:
          cycle === "custom" ? Number(months) : Number(cycle),
      });
      const plan = await clientFetch<{ id: number }>(
        savedId.current === null
          ? "/api/v1/billing/plans/"
          : `/api/v1/billing/plans/${savedId.current}/`,
        { method: savedId.current === null ? "POST" : "PATCH", body },
      );
      savedId.current = plan.id;
      await clientFetch(`/api/v1/billing/plans/${plan.id}/access/`, {
        method: "PUT",
        body: JSON.stringify({
          items: selectedItems.map((i) => ({
            content_type: i.content_type,
            object_id: i.object_id,
          })),
        }),
      });
      toast.success(t(isNew ? "created" : "saved"));
      setLeaving(true);
      navigate(BACK);
    },
    { errorToast: t("saveError") },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <NavLink href={BACK} aria-label={t("back")}>
            <ArrowLeft className="h-4 w-4" />
          </NavLink>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? t("new") : form.name || t("edit")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("formSubtitle")}</p>
        </div>
      </div>

      <PageState
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        }
      >
        {/* Not a <form>: Enter in the content search below would submit it,
            and a plan made by accident is public at once and cannot be
            deleted. */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plan-name">{t("name")}</Label>
                <Input
                  id="plan-name"
                  placeholder={t("namePlaceholder")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-description">{t("description")}</Label>
                <Textarea
                  id="plan-description"
                  placeholder={t("descriptionPlaceholder")}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plan-price">
                    {t("price", { currency: currency || tenantCurrency })}
                  </Label>
                  <Input
                    id="plan-price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-cycle">{t("cycle")}</Label>
                  <select
                    id="plan-cycle"
                    value={cycle}
                    onChange={(e) => setCycle(e.target.value as Cycle)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="1">{t("monthly")}</option>
                    <option value="12">{t("yearly")}</option>
                    <option value="custom">{t("custom")}</option>
                  </select>
                </div>
              </div>
              {cycle === "custom" && (
                <div className="space-y-2 sm:max-w-[50%]">
                  <Label htmlFor="plan-months">{t("months")}</Label>
                  <Input
                    id="plan-months"
                    type="number"
                    min="1"
                    max="36"
                    step="1"
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                  />
                </div>
              )}
              {!isNew && (
                <p className="text-xs text-muted-foreground">
                  {t("priceChangeHint")}
                </p>
              )}
              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div>
                  <Label htmlFor="plan-active">{t("onSale")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("onSaleHint")}
                  </p>
                </div>
                <Switch
                  id="plan-active"
                  checked={form.is_active}
                  onCheckedChange={(is_active) =>
                    setForm({ ...form, is_active })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("access")}</CardTitle>
              <CardDescription>{t("accessHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ContentPicker
                selected={selectedItems}
                onChange={setSelectedItems}
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={save}
              loading={saving || leaving}
              loadingText={t("saving")}
              disabled={
                !form.name.trim() ||
                !(Number(form.price) > 0) ||
                (cycle === "custom" &&
                  !(Number(months) >= 1 && Number(months) <= 36))
              }
            >
              {t(isNew ? "create" : "save")}
            </Button>
            <Button variant="outline" asChild>
              <NavLink href={BACK}>{t("cancel")}</NavLink>
            </Button>
          </div>
        </div>
      </PageState>
    </div>
  );
}
