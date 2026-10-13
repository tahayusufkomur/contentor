import { Clock, Radio, CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/format";

// ─── Small pieces the events list and form share ───────────────────

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  draft: {
    color: "bg-muted text-muted-foreground",
    icon: <Clock className="h-3 w-3" />,
  },
  scheduled: {
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: <Clock className="h-3 w-3" />,
  },
  live: {
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: <Radio className="h-3 w-3 animate-pulse" />,
  },
  ended: {
    color:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

/** `status` is one of draft | scheduled | live | ended (see displayStatus). */
export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const cfg = statusConfig[status] || statusConfig.draft;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}
    >
      {cfg.icon} {label}
    </div>
  );
}

export function PricingBadge({
  pricingType,
  price,
  currency,
  labels,
}: {
  pricingType: string;
  price: string;
  currency: string;
  labels: { free: string; membersOnly: string };
}) {
  if (pricingType === "free") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        {labels.free}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      {pricingType === "subscription"
        ? labels.membersOnly
        : formatMoney(price, currency)}
    </span>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
