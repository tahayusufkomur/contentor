"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Link2 } from "lucide-react";
import { LinkPickerModal } from "@/components/owner/link-picker";
import type { TenantConfig, NavbarConfig } from "@/types/tenant";

interface NavbarTabProps {
  config: TenantConfig;
  onChange: (patch: Partial<TenantConfig>) => void;
}

// Which destination picker is open: a nav-link row index, the CTA button, the
// "add new link" flow, or nothing.
type PickerTarget = number | "cta" | "new" | null;

/** Compact button that shows the current destination and opens the browsable
 *  link picker. Mirrors the LinkField pattern used in the block editor. */
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

export function NavbarTab({ config, onChange }: NavbarTabProps) {
  const navbar = config.navbar_config ?? {
    links: [],
    cta: null,
    show_login: true,
  };
  const links = navbar.links ?? [];
  const ctaEnabled = !!navbar.cta;
  const ctaText = navbar.cta?.text ?? "Get Started";
  const ctaHref = navbar.cta?.href ?? "/courses";
  const showLogin = navbar.show_login !== false;

  const [picker, setPicker] = useState<PickerTarget>(null);

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

  // Resolve a pick from the modal based on which target opened it.
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

  // The value to seed the modal's "Custom URL" tab with.
  const initialValue =
    picker === "cta"
      ? ctaHref
      : typeof picker === "number"
        ? (links[picker]?.href ?? "")
        : "";

  return (
    <div className="space-y-5">
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
            <div key={i} className="flex items-center gap-2">
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

        {/* Add link: browse pages, courses, events, or enter a custom URL. */}
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
