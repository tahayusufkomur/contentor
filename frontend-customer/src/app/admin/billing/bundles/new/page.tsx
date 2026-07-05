"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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

export default function NewBundlePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
  });
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  const originalPrice = useMemo(() => {
    const total = selectedItems.reduce(
      (sum, item) => sum + parseFloat(item.price || "0"),
      0,
    );
    return total.toFixed(2);
  }, [selectedItems]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedItems.length === 0) {
      toast.error("Please select at least one item for the bundle.");
      return;
    }
    setSaving(true);
    try {
      await clientFetch<Bundle>("/api/v1/billing/bundles/", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          price: form.price,
          items: selectedItems.map((i) => ({
            content_type: i.content_type,
            object_id: i.object_id,
          })),
        }),
      });
      toast.success("Bundle created successfully.");
      router.push("/admin/billing");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create bundle. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/billing">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price">Bundle Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Original Price (sum of items)</Label>
                <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  ${originalPrice}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create Bundle"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/billing">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
