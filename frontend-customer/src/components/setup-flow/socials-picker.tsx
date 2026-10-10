"use client";

import { socialOk } from "@/lib/interview";
import { cn } from "@/lib/utils";

const INPUT =
  "h-10 w-full rounded-xl border border-[var(--sf-line-strong)] bg-white px-3 text-[14px] text-[var(--sf-ink)] outline-none transition-[border-color,box-shadow] focus:border-[var(--sf-ink)] focus:shadow-[0_0_0_3px_var(--sf-brass-soft)] disabled:opacity-50";

/** A handle or profile link for each network ticked. The caller owns the
 * value, keyed by network name. */
export function SocialsPicker({
  networks,
  value,
  onChange,
  disabled,
  className,
}: {
  networks: string[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled: boolean;
  className?: string;
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
        const bad = !!value[n]?.trim() && !socialOk(n, value[n]);
        return (
          <label key={n} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[var(--sf-graphite)]">
              {n}
            </span>
            <input
              type="text"
              value={value[n] ?? ""}
              disabled={disabled}
              placeholder="@yourname or a link"
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
                No spaces: use your handle, like @mira.yoga, or paste the link.
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
