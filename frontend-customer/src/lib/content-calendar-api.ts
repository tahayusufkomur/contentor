import { clientFetch } from "@/lib/api-client";
import type { UnifiedCalendarItem } from "@/components/admin/calendar/unified-calendar";

/** Raw item shape from GET /api/v1/admin/content-calendar/ (snake_case). */
export interface ContentCalendarApiItem {
  id: string;
  category: "live" | "email" | "blog";
  source: string;
  title: string;
  scheduled_at: string;
  status: string;
  subtitle: string;
  href: string;
}

export function mapContentCalendarItem(
  item: ContentCalendarApiItem,
): UnifiedCalendarItem {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    scheduledAt: item.scheduled_at,
    status: item.status as UnifiedCalendarItem["status"],
    subtitle: item.subtitle || undefined,
    href: item.href,
  };
}

/**
 * Fetch the coach's unified content calendar for a [from, to] window
 * (YYYY-MM-DD). `types` is an optional CSV of live,email,blog.
 */
export async function listContentCalendar(
  from: string,
  to: string,
  types?: string,
): Promise<UnifiedCalendarItem[]> {
  const params = new URLSearchParams({ from, to });
  if (types) params.set("types", types);
  const data = await clientFetch<ContentCalendarApiItem[]>(
    `/api/v1/admin/content-calendar/?${params.toString()}`,
  );
  return data.map(mapContentCalendarItem);
}
