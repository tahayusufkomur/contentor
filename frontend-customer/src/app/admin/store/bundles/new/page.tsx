"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { clientFetch } from "@/lib/api-client";
import {
  ContentPicker,
  type SelectedItem,
} from "@/components/billing/content-picker";
import type { Bundle } from "@/types/billing";
import { formatMoney } from "@/lib/format";
import { useTenantCurrency } from "@/lib/setup-assistant";
import {
  AccessSection,
  type AccessProblem,
} from "@/components/admin/access/access-section";
import { useAccess } from "@/lib/access/use-access";
import { parsePrice } from "@/lib/access/ways";
import { ApiError } from "@/types/api";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

/** The creator's sentence from a refused access save, or "". */
const accessSentence = (err: unknown) =>
  err instanceof ApiError && typeof err.data.detail === "string"
    ? err.data.detail
    : "";

export default function NewBundlePage() {
  const navigate = useNavigate();
  const currency = useTenantCurrency();
  const [form, setForm] = useState({
    name: "",
    description: "",
  });
  // How people buy it: the Access section's price and window.
  const access = useAccess("bundle", null);
  const [accessProblems, setAccessProblems] = useState<AccessProblem[]>([]);
  const accessDirty =
    !!access.ways &&
    !!access.payload &&
    JSON.stringify(access.ways) !== JSON.stringify(access.payload.ways);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  const originalPrice = useMemo(() => {
    const total = selectedItems.reduce(
      (sum, item) => sum + parseFloat(item.price || "0"),
      0,
    );
    return total.toFixed(2);
  }, [selectedItems]);

  const { run: createBundle, loading: saving } = useAsyncAction(
    async () => {
      const price = parsePrice(access.ways?.buy?.price ?? "");
      if (accessProblems.length || !price) {
        toast.error(accessProblems[0]?.text ?? "Add a price above 0.");
        return;
      }
      const created = await clientFetch<Bundle>("/api/v1/billing/bundles/", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          price,
          items: selectedItems.map((i) => ({
            content_type: i.content_type,
            object_id: i.object_id,
          })),
        }),
      });
      // The bundle exists now: a refused window must not make a retry create
      // it twice, so say so and let her fix it on the bundle's page.
      try {
        if (accessDirty) await access.save(created.id);
      } catch (err) {
        toast.error(
          `Bundle created, but its terms were not saved. ${accessSentence(err)}`,
        );
        navigate(`/admin/store/bundles/${created.id}`);
        return;
      }
      toast.success("Bundle created successfully.");
      navigate("/admin/store?tab=bundles");
    },
    { errorToast: "Failed to create bundle. Please try again." },
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedItems.length === 0) {
      toast.error("Please select at least one item for the bundle.");
      return;
    }
    createBundle();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/store?tab=bundles">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Bundle</h1>
          <p className="text-sm text-muted-foreground">
            Group multiple products together at a discounted price.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bundle Details</CardTitle>
            <CardDescription>
              Basic information about your bundle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. Starter Pack"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Describe what's included in this bundle..."
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2 sm:max-w-xs">
              <Label>Original Price (sum of items)</Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                {formatMoney(originalPrice, currency)}
              </div>
            </div>
          </CardContent>
        </Card>

        <AccessSection
          kind="bundle"
          value={access.ways}
          onChange={access.setWays}
          payload={access.payload}
          onProblems={setAccessProblems}
        />
        {access.error && (
          <p role="alert" className="text-xs text-destructive">
            {access.error}
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Bundle Items</CardTitle>
            <CardDescription>
              Select the content to include in this bundle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContentPicker
              selected={selectedItems}
              onChange={setSelectedItems}
            />
          </CardContent>
        </Card>

        <Separator />

        <div className="flex gap-3">
          <Button type="submit" loading={saving} loadingText="Creating…">
            Create Bundle
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/store?tab=bundles">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
