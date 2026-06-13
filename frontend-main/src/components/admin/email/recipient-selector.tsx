"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getRecipientOptions,
  type RecipientFilter,
  type RecipientOptions,
} from "@/lib/platform-email-api";

interface RecipientSelectorProps {
  value: RecipientFilter;
  onChange: (filter: RecipientFilter) => void;
  recipientCount: number | null;
  onCountChange: (count: number | null) => void;
}

const TYPES = [
  { key: "all_coaches", label: "All coaches" },
  { key: "plan", label: "By plan" },
  { key: "tenant", label: "By workspace" },
  { key: "individual", label: "Individual coaches" },
] as const;

export function RecipientSelector({
  value,
  onChange,
  recipientCount,
  onCountChange,
}: RecipientSelectorProps) {
  const [options, setOptions] = useState<RecipientOptions>({
    coaches: [],
    plans: [],
    tenants: [],
  });
  const [coachSearch, setCoachSearch] = useState("");
  const [loadingCount, setLoadingCount] = useState(false);

  useEffect(() => {
    getRecipientOptions()
      .then(setOptions)
      .catch(() => setOptions({ coaches: [], plans: [], tenants: [] }));
  }, []);

  useEffect(() => {
    onCountChange(null);
    setLoadingCount(true);
    const timer = window.setTimeout(() => {
      if (value.type === "all_coaches") {
        onCountChange(options.coaches.length);
      } else if (value.type === "individual") {
        onCountChange(value.user_ids.length);
      } else {
        onCountChange(null); // plan/tenant resolved on send
      }
      setLoadingCount(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [onCountChange, options.coaches.length, value]);

  const filteredCoaches = useMemo(() => {
    const q = coachSearch.trim().toLowerCase();
    if (!q) return options.coaches;
    return options.coaches.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [coachSearch, options.coaches]);

  const filterType = value.type;

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">Recipients</label>

      <div className="flex flex-wrap gap-4">
        {TYPES.map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="recipient_type"
              checked={filterType === key}
              onChange={() => {
                if (key === "all_coaches") onChange({ type: "all_coaches" });
                if (key === "plan") onChange({ type: "plan", plan_ids: [] });
                if (key === "tenant")
                  onChange({ type: "tenant", tenant_ids: [] });
                if (key === "individual")
                  onChange({ type: "individual", user_ids: [] });
              }}
              className="accent-primary"
            />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>

      {filterType === "plan" && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Select plans</label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {options.plans.map((plan) => {
              const selected =
                value.type === "plan" && value.plan_ids.includes(plan.id);
              return (
                <label
                  key={plan.id}
                  className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      if (value.type !== "plan") return;
                      const nextIds = selected
                        ? value.plan_ids.filter((id) => id !== plan.id)
                        : [...value.plan_ids, plan.id];
                      onChange({ type: "plan", plan_ids: nextIds });
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm capitalize">{plan.name}</span>
                </label>
              );
            })}
            {options.plans.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">
                No plans found.
              </p>
            )}
          </div>
        </div>
      )}

      {filterType === "tenant" && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Select workspaces
          </label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {options.tenants.map((tenant) => {
              const selected =
                value.type === "tenant" && value.tenant_ids.includes(tenant.id);
              return (
                <label
                  key={tenant.id}
                  className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      if (value.type !== "tenant") return;
                      const nextIds = selected
                        ? value.tenant_ids.filter((id) => id !== tenant.id)
                        : [...value.tenant_ids, tenant.id];
                      onChange({ type: "tenant", tenant_ids: nextIds });
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm">{tenant.name}</span>
                  {tenant.owner_email && (
                    <span className="text-xs text-muted-foreground">
                      {tenant.owner_email}
                    </span>
                  )}
                </label>
              );
            })}
            {options.tenants.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">
                No workspaces found.
              </p>
            )}
          </div>
        </div>
      )}

      {filterType === "individual" && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search coaches..."
            value={coachSearch}
            onChange={(event) => setCoachSearch(event.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredCoaches.map((coach) => {
              const selected =
                value.type === "individual" &&
                value.user_ids.includes(coach.id);
              return (
                <label
                  key={coach.id}
                  className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      if (value.type !== "individual") return;
                      const nextIds = selected
                        ? value.user_ids.filter((id) => id !== coach.id)
                        : [...value.user_ids, coach.id];
                      onChange({ type: "individual", user_ids: nextIds });
                    }}
                    className="accent-primary"
                  />
                  <span className="text-sm">{coach.name || coach.email}</span>
                  {coach.name && (
                    <span className="text-xs text-muted-foreground">
                      {coach.email}
                    </span>
                  )}
                </label>
              );
            })}
            {filteredCoaches.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">
                No coaches found.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        {loadingCount
          ? "Counting recipients..."
          : recipientCount !== null
            ? `${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`
            : filterType === "all_coaches"
              ? "All active coaches"
              : "Recipients resolved on send"}
      </div>
    </div>
  );
}
