"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ImagePlus,
  Link2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "../../../lib/utils";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { Switch } from "../../../ui/switch";
import { useEmailEditor } from "../store";
import { tokenName } from "../tree";
import type { Alignment, Spacing } from "../types";

// Her brand's colours, in the order the swatch grid shows them (each is a
// message: studio.emailEditor.controls.colorToken.<name>).
export const COLOR_TOKENS = [
  "primary",
  "primaryForeground",
  "accent",
  "accentForeground",
  "foreground",
  "muted",
  "background",
  "surface",
  "border",
  "inverse",
  "inverseForeground",
] as const;
type ColorToken = (typeof COLOR_TOKENS)[number];
const isColorToken = (name: string | null): name is ColorToken =>
  (COLOR_TOKENS as readonly string[]).includes(name ?? "");

export const EMAIL_FONTS: [string, string][] = [
  ["Georgia, 'Times New Roman', Times, serif", "Georgia"],
  ["Arial, Helvetica, sans-serif", "Arial / Helvetica"],
  ["'Trebuchet MS', Helvetica, sans-serif", "Trebuchet"],
  ["Verdana, Geneva, sans-serif", "Verdana"],
  ["'Times New Roman', Times, serif", "Times"],
  ["'Courier New', Courier, monospace", "Courier"],
];

export const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 border-t px-4 py-4 first:border-t-0">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        aria-label={label}
        className="h-9"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Field label={label}>
      <textarea
        aria-label={label}
        rows={rows}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = "px",
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const t = useTranslations("studio.emailEditor.controls");
  const v = value ?? min;
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-primary"
        />
        <div className="flex w-[4.75rem] items-center rounded-lg border border-input bg-background pr-2 focus-within:ring-[3px] focus-within:ring-ring">
          <input
            type="number"
            aria-label={t("numberValue", { label })}
            min={min}
            max={max}
            step={step}
            value={v}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
            }}
            className="h-8 w-full min-w-0 bg-transparent px-2 text-sm text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && (
            <span className="text-xs text-muted-foreground">{unit}</span>
          )}
        </div>
      </div>
    </Field>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find(([v]) => String(v) === raw);
          if (match) onChange(match[0]);
        }}
        className={fieldClass}
      >
        {options.map(([v, text]) => (
          <option key={String(v)} value={String(v)}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Two to four mutually exclusive choices as one segmented row. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, React.ReactNode, string?][];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded-lg border bg-muted/40 p-0.5"
      >
        {options.map(([v, content, title]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            title={title}
            aria-label={title}
            onClick={() => onChange(v)}
            className={cn(
              "flex h-8 flex-1 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors",
              value === v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {content}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function AlignField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: Alignment | undefined;
  onChange: (v: Alignment) => void;
}) {
  const t = useTranslations("studio.emailEditor.controls");
  return (
    <Segmented<Alignment>
      label={label ?? t("alignment")}
      value={value ?? "left"}
      onChange={onChange}
      options={[
        ["left", <AlignLeft key="l" className="h-4 w-4" />, t("left")],
        ["center", <AlignCenter key="c" className="h-4 w-4" />, t("center")],
        ["right", <AlignRight key="r" className="h-4 w-4" />, t("right")],
      ]}
    />
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

export function SpacingField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: Spacing | undefined;
  onChange: (v: Spacing) => void;
}) {
  const t = useTranslations("studio.emailEditor.controls");
  const v = value ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const shown = label ?? t("padding");
  const sides: [keyof Spacing, string, string][] = [
    ["top", t("top"), t("paddingTop", { label: shown })],
    ["right", t("right"), t("paddingRight", { label: shown })],
    ["bottom", t("bottom"), t("paddingBottom", { label: shown })],
    ["left", t("left"), t("paddingLeft", { label: shown })],
  ];
  return (
    <Field label={shown}>
      <div className="grid grid-cols-4 gap-1.5">
        {sides.map(([side, name, aria]) => (
          <label key={side} className="space-y-0.5 text-center">
            <input
              type="number"
              min={0}
              max={160}
              aria-label={aria}
              value={v[side] ?? 0}
              onChange={(e) =>
                onChange({
                  ...v,
                  [side]: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="h-8 w-full rounded-lg border border-input bg-background px-1.5 text-center text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[10px] text-muted-foreground">{name}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

const HEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

/** Brand swatches first (the value becomes a token, so it follows her look),
 *  then any colour. `allowNone` adds "None" (transparent). */
export function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
}) {
  const t = useTranslations("studio.emailEditor.controls");
  const { kit } = useEmailEditor();
  const [open, setOpen] = useState(false);
  const token = tokenName(value);
  const shown = token ? (kit.colors[token] ?? "#000000") : value || "";
  const name = token
    ? t("brandColour", {
        name: isColorToken(token) ? t(`colorToken.${token}`) : token,
      })
    : value || t("none");
  const tokens = COLOR_TOKENS.filter((id) => kit.colors[id]);
  const [draft, setDraft] = useState("");

  return (
    <Field label={label}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-background px-2 text-left text-sm text-foreground hover:bg-accent/40"
      >
        <span
          className="h-5 w-5 shrink-0 rounded-md border"
          style={
            shown
              ? { backgroundColor: shown }
              : {
                  backgroundImage:
                    "linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)",
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 0,4px 4px",
                }
          }
        />
        <span className="truncate">{name}</span>
      </button>
      {open && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
          {tokens.length > 0 && (
            <div className="grid grid-cols-6 gap-1.5">
              {tokens.map((tokenId) => {
                const swatch = t("brandColour", {
                  name: t(`colorToken.${tokenId}`),
                });
                return (
                  <button
                    key={tokenId}
                    type="button"
                    title={swatch}
                    aria-label={swatch}
                    onClick={() => {
                      onChange(`brand:${tokenId}`);
                      setOpen(false);
                    }}
                    className={cn(
                      "h-7 w-full rounded-md border transition-transform hover:scale-105",
                      token === tokenId &&
                        "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                    style={{ backgroundColor: kit.colors[tokenId] }}
                  />
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              aria-label={t("pickAnyColour", { label })}
              value={HEX.test(shown) && shown.length === 7 ? shown : "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-background p-0.5"
            />
            <input
              aria-label={t("hexValue", { label })}
              placeholder="#1a1a1a"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (HEX.test(e.target.value.trim()))
                  onChange(e.target.value.trim());
              }}
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            />
            {allowNone && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                {t("none")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Field>
  );
}

/** Her brand fonts first, then fonts every inbox has. */
export function FontField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("studio.emailEditor.controls");
  const { kit } = useEmailEditor();
  const first = (stack: string) =>
    stack.split(",")[0].replace(/['"]/g, "").trim();
  const options: [string, string][] = [
    [
      "brand:heading",
      t("brandHeadingFont", { font: first(kit.fonts.heading) }),
    ],
    ["brand:body", t("brandBodyFont", { font: first(kit.fonts.body) })],
    ...EMAIL_FONTS,
  ];
  if (value && !options.some(([v]) => v === value))
    options.push([value, first(value)]);
  return (
    <SelectField
      label={label ?? t("font")}
      value={value ?? "brand:body"}
      options={options}
      onChange={onChange}
    />
  );
}

/** A link: typed, or picked from her pages and content. */
export function LinkField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("studio.emailEditor.controls");
  const { pickLink } = useEmailEditor();
  const shown = label ?? t("link");
  return (
    <Field label={shown}>
      <div className="flex gap-1.5">
        <Input
          aria-label={shown}
          className="h-9 min-w-0 flex-1"
          value={value ?? ""}
          placeholder={t("linkPlaceholder")}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-9 shrink-0"
          title={t("choosePageOrOffer")}
          aria-label={t("choosePageOrOffer")}
          onClick={async () => {
            const href = await pickLink(value ?? "");
            if (href !== null) onChange(href);
          }}
        >
          <Link2 />
        </Button>
      </div>
    </Field>
  );
}

/** An image: picked from her library (or the catalog), shown as a thumbnail. */
export function ImageField({
  label,
  value,
  onPick,
  onClear,
}: {
  label?: string;
  value: string;
  onPick: (src: string, alt: string, width?: number, height?: number) => void;
  onClear?: () => void;
}) {
  const t = useTranslations("studio.emailEditor.controls");
  const { pickImage } = useEmailEditor();
  return (
    <Field label={label ?? t("image")}>
      <div className="flex items-center gap-2">
        <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-5 w-5 text-muted-foreground/50" />
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            const picked = await pickImage();
            if (picked)
              onPick(picked.src, picked.alt, picked.width, picked.height);
          }}
        >
          {value ? t("replaceImage") : t("chooseImage")}
        </Button>
        {value && onClear && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title={t("removeImage")}
            aria-label={t("removeImage")}
            onClick={onClear}
          >
            <X />
          </Button>
        )}
      </div>
    </Field>
  );
}
