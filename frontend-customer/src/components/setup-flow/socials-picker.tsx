"use client";

import { socialLink, socialOk, socialSite } from "@/lib/interview";
import { cn } from "@/lib/utils";

const INPUT =
  "h-10 w-full rounded-xl border border-[var(--sf-line-strong)] bg-white px-3 text-[14px] text-[var(--sf-ink)] outline-none transition-[border-color,box-shadow] focus:border-[var(--sf-ink)] focus:shadow-[0_0_0_3px_var(--sf-brass-soft)] disabled:opacity-50";

/** A detail for each choice ticked: a handle or profile link per social
 * network by default (a link has to be on that network's own site, and the
 * profile it means reads back under the box), or what ``placeholder``/
 * ``ok``/``problem``/``reads`` describe (a contact way's email address or
 * number). The caller owns the value, keyed by choice. */
export function SocialsPicker({
  networks,
  value,
  onChange,
  disabled,
  className,
  placeholder = (n) => `${socialSite(n)}yourname or @yourname`,
  ok = socialOk,
  problem = (n) =>
    `Use your ${n} handle, like @mira.yoga, or a link that starts with ${socialSite(n)}`,
  reads = socialLink,
}: {
  networks: string[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled: boolean;
  className?: string;
  placeholder?: (choice: string) => string;
  ok?: (choice: string, raw: string) => boolean;
  problem?: (choice: string) => string;
  /** What a valid entry means, read back under its box. */
  reads?: (choice: string, raw: string) => string | null;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 rounded-2xl border border-[var(--sf-line)] bg-white p-4 sm:grid-cols-2 sm:p-5",
        className,
      )}
    >
      {networks.map((n) => {
        // Checked as typed, the way the server will read it.
        const bad = !!value[n]?.trim() && !ok(n, value[n]);
        const means = bad ? null : reads(n, value[n] ?? "");
        return (
          <label key={n} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[var(--sf-graphite)]">
              {n}
            </span>
            <input
              type="text"
              value={value[n] ?? ""}
              disabled={disabled}
              placeholder={placeholder(n)}
              autoComplete="off"
              aria-invalid={bad || undefined}
              aria-describedby={bad ? `social-${n}-error` : undefined}
              onChange={(e) => onChange({ ...value, [n]: e.target.value })}
              className={INPUT}
            />
            {bad && (
              <span
                id={`social-${n}-error`}
                className="text-[12.5px] text-destructive"
              >
                {problem(n)}
              </span>
            )}
            {means && (
              <span className="truncate text-[12.5px] text-[var(--sf-graphite)]">
                {means}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
