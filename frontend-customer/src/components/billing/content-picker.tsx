"use client";

import { useEffect, useState, useMemo } from "react";
import { X, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useTenantCurrency } from "@/lib/setup-assistant";

export interface SelectedItem {
  content_type: string;
  object_id: number;
  title: string;
  price: string;
  /** When it opens and closes for a member, in plain words; set on a link the plan already holds. */
  window_text?: string;
}

export interface Product {
  id: number;
  title: string;
  type: string;
  price: string;
  content_type?: string;
  pricing_type?: string;
}

const TYPE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Course", value: "course" },
  { label: "Download", value: "download" },
  { label: "Live Session", value: "live_class" },
  { label: "Live Stream", value: "live_stream" },
  { label: "In-Person Event", value: "onsite_event" },
];

const TYPE_LABEL_MAP: Record<string, string> = {
  course: "Course",
  download: "Download",
  live_class: "Live Session",
  live_stream: "Live Stream",
  onsite_event: "In-Person Event",
};

const TYPE_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "success" | "warning" | "brand"
> = {
  course: "brand",
  download: "secondary",
  live_class: "warning",
  live_stream: "success",
  onsite_event: "outline",
};

const SESSIONS = ["live_class", "live_stream", "onsite_event"];

/** The selected items as chips: a class series (sessions sharing a type and a
 *  title) is one chip, as the bundle and plan counts take it. */
export function chipsOf(selected: SelectedItem[]): SelectedItem[][] {
  const chips = new Map<string, SelectedItem[]>();
  for (const item of selected) {
    const key = SESSIONS.includes(item.content_type)
      ? `${item.content_type}:${item.title}`
      : `${item.content_type}-${item.object_id}`;
    chips.set(key, [...(chips.get(key) ?? []), item]);
  }
  return [...chips.values()];
}

interface ContentPickerProps {
  selected: SelectedItem[];
  onChange: (items: SelectedItem[]) => void;
  /** What to pick from. Left out, the picker loads the store's products
   *  (what a bundle can hold). */
  products?: Product[];
}

export function ContentPicker({
  selected,
  onChange,
  products: given,
}: ContentPickerProps) {
  const currency = useTenantCurrency();
  const [fetched, setFetched] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!given);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const products = given ?? fetched;
  const loadsOwn = !given;

  useEffect(() => {
    if (!loadsOwn) return;
    let cancelled = false;
    clientFetch<Product[]>("/api/v1/billing/products/")
      .then((data) => {
        // Filter out bundles
        if (!cancelled) setFetched(data.filter((p) => p.type !== "bundle"));
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load content.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadsOwn]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesType = typeFilter === "all" || p.type === typeFilter;
      const matchesSearch =
        search === "" || p.title.toLowerCase().includes(search.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [products, typeFilter, search]);

  function isSelected(product: Product) {
    return selected.some(
      (s) => s.content_type === product.type && s.object_id === product.id,
    );
  }

  function toggle(product: Product) {
    if (isSelected(product)) {
      onChange(
        selected.filter(
          (s) =>
            !(s.content_type === product.type && s.object_id === product.id),
        ),
      );
    } else {
      onChange([
        ...selected,
        {
          content_type: product.content_type ?? product.type,
          object_id: product.id,
          title: product.title,
          price: product.price,
        },
      ]);
    }
  }

  // Removing a series' chip removes every session in it.
  function removeSelected(chip: SelectedItem[]) {
    onChange(selected.filter((s) => !chip.includes(s)));
  }

  return (
    <div className="space-y-3">
      {/* Selected items */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-md border p-3 bg-muted/30">
          {chipsOf(selected).map((chip) => {
            const [item] = chip;
            return (
              <span
                key={`${item.content_type}-${item.object_id}`}
                className="inline-flex items-center gap-1 rounded-2xl border bg-background px-2.5 py-0.5 text-xs font-medium"
              >
                <span className="flex flex-col leading-tight">
                  {chip.length > 1
                    ? `${item.title} · ${chip.length} sessions`
                    : item.title}
                  {item.window_text && (
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {item.window_text}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeSelected(chip)}
                  className="ml-1 rounded-full hover:text-destructive focus:outline-none"
                  aria-label={`Remove ${item.title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search and filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.filter(
            (f) =>
              f.value !== "onsite_event" ||
              products.some((p) => p.type === f.value),
          ).map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={typeFilter === f.value ? "default" : "outline"}
              onClick={() => setTypeFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-4 w-4 rounded-sm" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            No content found.
          </p>
        ) : (
          filtered.map((product) => {
            const checked = isSelected(product);
            return (
              <label
                key={`${product.type}-${product.id}`}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(product)}
                  id={`product-${product.type}-${product.id}`}
                />
                <span className="flex-1 text-sm font-medium">
                  {product.title}
                </span>
                <Badge variant={TYPE_BADGE_VARIANT[product.type] ?? "outline"}>
                  {TYPE_LABEL_MAP[product.type] ?? product.type}
                </Badge>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {product.pricing_type === "subscription"
                    ? "Members only"
                    : formatMoney(product.price, currency)}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
