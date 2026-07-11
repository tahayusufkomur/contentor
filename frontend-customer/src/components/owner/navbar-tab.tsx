"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";
import { LinkPickerModal } from "@/components/owner/link-picker";
import { clientFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { NavbarConfig, NavbarLayout, TenantConfig } from "@/types/tenant";

interface NavbarTabProps {
  config: TenantConfig;
  onChange: (patch: Partial<TenantConfig>) => void;
}

type PickerTarget = number | "cta" | "new" | null;

const LAYOUTS: { id: NavbarLayout; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "centered", label: "Centered" },
  { id: "split", label: "Split" },
  { id: "minimal", label: "Minimal" },
  { id: "pill", label: "Pill" },
];

/** Tiny CSS wireframe of each layout for the picker buttons. */
function LayoutThumb({ id }: { id: NavbarLayout }) {
  const bar = "h-1 w-4 rounded bg-muted-foreground/50";
  const dot = "h-2 w-2 shrink-0 rounded-full bg-muted-foreground";
  switch (id) {
    case "classic":
      return (
        <div className="flex w-full items-center justify-between px-1.5">
          <span className={dot} />
          <span className="flex gap-1">
            <span className={bar} />
            <span className={bar} />
            <span className="h-1 w-3 rounded bg-primary" />
          </span>
        </div>
      );
    case "centered":
      return (
        <div className="flex w-full flex-col items-center gap-1">
          <span className={dot} />
          <span className="flex gap-1">
            <span className={bar} />
            <span className={bar} />
            <span className={bar} />
          </span>
        </div>
      );
    case "split":
      return (
        <div className="flex w-full items-center justify-between px-1.5">
          <span className={bar} />
          <span className={dot} />
          <span className={bar} />
        </div>
      );
    case "minimal":
      return (
        <div className="flex w-full items-center justify-between px-1.5">
          <span className={dot} />
          <span className="flex flex-col gap-0.5">
            <span className="h-0.5 w-3 bg-muted-foreground" />
            <span className="h-0.5 w-3 bg-muted-foreground" />
            <span className="h-0.5 w-3 bg-muted-foreground" />
          </span>
        </div>
      );
    case "pill":
      return (
        <div className="flex w-full justify-center">
          <span className="flex items-center gap-1 rounded-full border border-muted-foreground/40 px-2 py-0.5">
            <span className={dot} />
            <span className={bar} />
          </span>
        </div>
      );
  }
}

function DestinationButton({
  href,
  onClick,
}: {
  href: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Choose a page or content"
      className="flex flex-1 items-center gap-1.5 overflow-hidden rounded-md border px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground"
    >
      <Link2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{href || "Choose destination…"}</span>
    </button>
  );
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export function NavbarTab({ config, onChange }: NavbarTabProps) {
  const navbar = config.navbar_config ?? {
    links: [],
    cta: null,
    show_login: true,
  };
  const links = navbar.links ?? [];
  const layout: NavbarLayout = navbar.layout ?? "classic";
  const ctaEnabled = !!navbar.cta;
  const ctaText = navbar.cta?.text ?? "Get Started";
  const ctaHref = navbar.cta?.href ?? "/courses";
  const showLogin = navbar.show_login !== false;
  const showInstall = navbar.show_install !== false;
  const transparent = navbar.transparent_over_hero === true;

  const [picker, setPicker] = useState<PickerTarget>(null);
  // Which capability suggestions apply (fetched once): hrefs the tenant has
  // content for. Filtered against current links at render time.
  const [available, setAvailable] = useState<{ label: string; href: string }[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found: { label: string; href: string }[] = [];
      try {
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 90);
        const events = await clientFetch<unknown[]>(
          `/api/v1/calendar/?from=${isoDate(from)}&to=${isoDate(to)}`,
        );
        if (Array.isArray(events) && events.length > 0) {
          found.push({ label: "Live Classes", href: "/events" });
        }
      } catch {}
      try {
        const store = await clientFetch<unknown[] | { results?: unknown[] }>(
          "/api/v1/billing/store/",
        );
        const items = Array.isArray(store) ? store : (store?.results ?? []);
        if (items.length > 0) found.push({ label: "Store", href: "/store" });
      } catch {}
      if (!cancelled) setAvailable(found);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = available.filter(
    (s) => !links.some((l) => l.href === s.href),
  );

  const emit = (patch: Partial<NavbarConfig>) => {
    onChange({ navbar_config: { ...navbar, ...patch } });
  };

  const updateLink = (i: number, field: "label" | "href", value: string) => {
    emit({
      links: links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)),
    });
  };
  const removeLink = (i: number) =>
    emit({ links: links.filter((_, idx) => idx !== i) });
  const moveLink = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j], next[i]];
    emit({ links: next });
  };

  const handlePick = (href: string, label?: string) => {
    if (picker === "new") {
      emit({ links: [...links, { label: label || href, href }] });
    } else if (picker === "cta") {
      emit({ cta: { text: ctaText, href } });
    } else if (typeof picker === "number") {
      const i = picker;
      emit({
        links: links.map((l, idx) =>
          idx === i ? { label: l.label || label || href, href } : l,
        ),
      });
    }
    setPicker(null);
  };

  const initialValue =
    picker === "cta"
      ? ctaHref
      : typeof picker === "number"
        ? (links[picker]?.href ?? "")
        : "";

  return (
    <div className="space-y-5">
      {/* Layout preset */}
      <div className="space-y-2">
        <Label>Layout</Label>
        <div className="grid grid-cols-5 gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              title={l.label}
              aria-label={`Layout: ${l.label}`}
              onClick={() => emit({ layout: l.id })}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-[10px] transition-colors",
                layout === l.id
                  ? "border-primary bg-primary/5 text-foreground"
                  : "text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              <LayoutThumb id={l.id} />
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transparent over hero (not applicable to the floating pill) */}
      {layout !== "pill" && (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label>Transparent over hero</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              See-through on the homepage hero, solid after scrolling
            </p>
          </div>
          <Switch
            checked={transparent}
            onCheckedChange={(v) => emit({ transparent_over_hero: v })}
          />
        </div>
      )}

      {/* Nav links */}
      <div className="space-y-2">
        <Label>Navigation links</Label>
        {links.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No links yet. Add one below.
          </p>
        )}
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="flex flex-col">
                <button
                  onClick={() => moveLink(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  title="Move up"
                  aria-label={`Move ${link.label || "link"} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveLink(i, 1)}
                  disabled={i === links.length - 1}
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  title="Move down"
                  aria-label={`Move ${link.label || "link"} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                placeholder="Label"
                value={link.label}
                onChange={(e) => updateLink(i, "label", e.target.value)}
                className="flex-1"
              />
              <DestinationButton
                href={link.href}
                onClick={() => setPicker(i)}
              />
              <button
                onClick={() => removeLink(i)}
                className="text-muted-foreground transition-colors hover:text-destructive"
                title="Remove link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Capability suggestions: content exists but no link points at it. */}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.href}
                type="button"
                onClick={() => emit({ links: [...links, s] })}
                className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Add {s.label}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setPicker("new")}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add link
        </button>
      </div>

      {/* CTA button */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Label>CTA button</Label>
          <Switch
            checked={ctaEnabled}
            onCheckedChange={(v) =>
              emit({ cta: v ? { text: ctaText, href: ctaHref } : null })
            }
          />
        </div>
        {ctaEnabled && (
          <div className="space-y-2">
            <Input
              placeholder="Button text"
              value={ctaText}
              onChange={(e) =>
                emit({ cta: { text: e.target.value, href: ctaHref } })
              }
            />
            <DestinationButton
              href={ctaHref}
              onClick={() => setPicker("cta")}
            />
          </div>
        )}
      </div>

      {/* Show login */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label>Show login button</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Display &quot;Sign In&quot; link in nav
          </p>
        </div>
        <Switch
          checked={showLogin}
          onCheckedChange={(v) => emit({ show_login: v })}
        />
      </div>

      {/* Show Install app */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label>Show &quot;Install app&quot;</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Link visitors to installing your site as an app
          </p>
        </div>
        <Switch
          checked={showInstall}
          onCheckedChange={(v) => emit({ show_install: v })}
        />
      </div>

      {picker !== null && (
        <LinkPickerModal
          initialValue={initialValue}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
