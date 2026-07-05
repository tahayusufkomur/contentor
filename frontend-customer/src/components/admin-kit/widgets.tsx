"use client";

// Shared admin-kit (schema-driven admin renderer).
// Canonical copy: frontend-customer. After editing, run scripts/sync-admin-kit.sh
// to mirror into frontend-main — the two copies must stay byte-identical.
//
// Cell renderers (schema → table cell) and form widgets (schema → input).

import { Check, Minus } from "lucide-react";

import type {
  ChoiceOption,
  ColumnSchema,
  FieldSchema,
  FkValue,
  RowValue,
} from "@/lib/admin-kit/types";

import { KitInput, KitSelect, KitTextarea, KitToggle } from "./primitives";

function isFkValue(value: RowValue): value is FkValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    "value" in value
  );
}

export function CellValue({
  column,
  value,
}: {
  column: ColumnSchema;
  value: RowValue | undefined;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  switch (column.type) {
    case "boolean":
      return value ? (
        <Check className="h-4 w-4 text-primary" aria-label="yes" />
      ) : (
        <Minus className="h-4 w-4 text-muted-foreground" aria-label="no" />
      );
    case "fk":
      return <span>{isFkValue(value) ? value.label : String(value)}</span>;
    case "choice": {
      const match = column.choices?.find((c) => c.value === value);
      return (
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
          {match?.label ?? String(value)}
        </span>
      );
    }
    case "datetime":
      return (
        <span className="text-muted-foreground">
          {new Date(String(value)).toLocaleString()}
        </span>
      );
    case "date":
      return (
        <span className="text-muted-foreground">
          {new Date(String(value)).toLocaleDateString()}
        </span>
      );
    case "decimal":
    case "integer":
      return <span className="tabular-nums">{String(value)}</span>;
    case "json":
      return (
        <span className="font-mono text-xs text-muted-foreground">{"{…}"}</span>
      );
    default:
      return (
        <span className="max-w-[28ch] truncate align-middle">
          {String(value)}
        </span>
      );
  }
}

interface FieldInputProps {
  field: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  /** FK options, loaded by the form via the autocomplete endpoint. */
  fkOptions?: ChoiceOption[];
  error?: string;
}

export function FieldInput({
  field,
  value,
  onChange,
  fkOptions,
  error,
}: FieldInputProps) {
  const disabled = field.read_only;
  const invalid = error ? "border-destructive focus:ring-destructive" : "";

  const control = (() => {
    switch (field.type) {
      case "boolean":
        return (
          <KitToggle
            checked={Boolean(value)}
            onChange={onChange}
            disabled={disabled}
            label={field.label}
          />
        );
      case "text":
        return (
          <KitTextarea
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={invalid}
          />
        );
      case "json":
        return (
          <KitTextarea
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            spellCheck={false}
            className={`font-mono text-xs ${invalid}`}
          />
        );
      case "choice":
        return (
          <KitSelect
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={invalid}
          >
            {!field.required && <option value="">—</option>}
            {(field.choices ?? []).map((choice) => (
              <option key={String(choice.value)} value={String(choice.value)}>
                {choice.label}
              </option>
            ))}
          </KitSelect>
        );
      case "fk":
        return (
          <KitSelect
            value={String(value ?? "")}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : e.target.value)
            }
            disabled={disabled}
            className={invalid}
          >
            <option value="">—</option>
            {(fkOptions ?? []).map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </KitSelect>
        );
      case "integer":
        return (
          <KitInput
            type="number"
            step={1}
            min={field.min_value}
            max={field.max_value}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={invalid}
          />
        );
      case "decimal":
        return (
          <KitInput
            type="number"
            step={field.decimal_places ? 1 / 10 ** field.decimal_places : "any"}
            min={field.min_value}
            max={field.max_value}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={invalid}
          />
        );
      case "datetime":
      case "date":
        return (
          <KitInput
            type={field.type === "date" ? "date" : "datetime-local"}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={invalid}
          />
        );
      default:
        return (
          <KitInput
            type={
              field.type === "email"
                ? "email"
                : field.type === "url"
                  ? "url"
                  : "text"
            }
            maxLength={field.max_length}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={invalid}
          />
        );
    }
  })();

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-sm font-medium text-foreground">
        {field.label}
        {field.required && !disabled && (
          <span className="text-destructive">*</span>
        )}
        {disabled && (
          <span className="text-xs font-normal text-muted-foreground">
            (read-only)
          </span>
        )}
      </label>
      {control}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : field.help_text ? (
        <p className="text-xs text-muted-foreground">{field.help_text}</p>
      ) : null}
    </div>
  );
}
