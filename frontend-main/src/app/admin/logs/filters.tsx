"use client";

import type { Facet, TimeRange } from "@/lib/platform-logs-api";

export const TIME_RANGES: TimeRange[] = ["15m", "1h", "6h", "24h", "7d", "14d"];

function toggle(csv: string, value: string): string {
  const parts = csv ? csv.split(",") : [];
  const next = parts.includes(value)
    ? parts.filter((p) => p !== value)
    : [...parts, value];
  return next.join(",");
}

/** Multi-select chips fed by live facet counts. Zero-count options are absent
 * from `facets`; active selections stay rendered so they can be unselected. */
export function FacetChips({
  label,
  facets,
  selected,
  onChange,
}: {
  label: string;
  facets: Facet[];
  selected: string; // comma-joined
  onChange: (next: string) => void;
}) {
  const active = selected ? selected.split(",") : [];
  const known = new Set(facets.map((f) => f.value));
  const stale = active.filter((v) => !known.has(v));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {facets.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(toggle(selected, f.value))}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${
            active.includes(f.value)
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted"
          }`}
        >
          {f.value} <span className="opacity-70">{f.count}</span>
        </button>
      ))}
      {stale.map((v) => (
        <button
          key={v}
          onClick={() => onChange(toggle(selected, v))}
          className="rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs text-primary-foreground opacity-60"
        >
          {v} <span className="opacity-70">0</span>
        </button>
      ))}
    </div>
  );
}

/** Single-value select for high-cardinality dimensions (tenant, user). */
export function FacetSelect({
  label,
  facets,
  selected,
  onChange,
}: {
  label: string;
  facets: Facet[];
  selected: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="">all</option>
        {selected && !facets.some((f) => f.value === selected) && (
          <option value={selected}>{selected} (0)</option>
        )}
        {facets.map((f) => (
          <option key={f.value} value={f.value}>
            {f.value} ({f.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-64 rounded-md border bg-background px-3 py-1.5 text-sm"
    />
  );
}

/** Typeahead combobox for the high-cardinality user dimension: native
 * datalist over the facet top-20, but free typing lets you filter on any
 * email (the backend filter is exact-match on the param, facet presence not
 * required). Commits on change/blur/Enter. */
export function UserCombobox({
  facets,
  selected,
  onChange,
}: {
  facets: Facet[];
  selected: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      User
      <input
        type="text"
        list="logbook-user-options"
        defaultValue={selected}
        key={selected} /* re-mount when cross-links set the filter */
        placeholder="any"
        onBlur={(e) => onChange(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter")
            onChange((e.target as HTMLInputElement).value.trim());
        }}
        className="w-52 rounded-md border bg-background px-2 py-1 text-xs text-foreground"
      />
      <datalist id="logbook-user-options">
        {facets.map((f) => (
          <option key={f.value} value={f.value}>
            {f.count}
          </option>
        ))}
      </datalist>
    </label>
  );
}
