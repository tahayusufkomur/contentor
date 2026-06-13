import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceBadge } from "@/components/billing/price-badge";
import { ArrowRight } from "lucide-react";
import type { StoreItem } from "@/types/billing";
import type { BlockComponentProps } from "@/lib/blocks/types";

const TYPE_LABELS: Record<string, string> = {
  course: "Course",
  download: "Download",
  live_class: "Live Class",
  live_stream: "Live Stream",
  bundle: "Bundle",
};

export function StoreProductsBlock({ data, dynamicData }: BlockComponentProps) {
  let items: StoreItem[] = dynamicData ?? [];
  const limit = Number(data.limit) || 8;
  items = items.slice(0, limit);
  if (!items.length) return null;

  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex items-center justify-between">
          {data.heading && (
            <h2 className="font-display text-3xl font-bold tracking-tight">{data.heading}</h2>
          )}
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link href="/store">
              Browse store
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <Link key={`${item.type}-${item.id}`} href="/store">
              <Card className="group h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg">
                {item.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnail_url}
                    alt={item.title}
                    className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                    <span className="text-4xl font-bold text-primary/30">{item.title.charAt(0)}</span>
                  </div>
                )}
                <CardContent className="space-y-3 p-4">
                  <Badge variant="secondary" className="text-xs">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </Badge>
                  <h3 className="font-semibold leading-snug line-clamp-2">{item.title}</h3>
                  <PriceBadge accessInfo={item.access_info} price={item.price} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
