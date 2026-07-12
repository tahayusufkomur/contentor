"use client";

// Shared admin-kit (schema-driven admin renderer).
// Canonical copy: frontend-customer. After editing, run scripts/sync-admin-kit.sh
// to mirror into frontend-main — the two copies must stay byte-identical.
//
// Slide-over create/edit form generated from a model's field schema.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";

import { AdminKitError, type AdminClient } from "@/lib/admin-kit/client";
import type {
  ChoiceOption,
  FieldSchema,
  ModelMeta,
  Row,
  RowValue,
} from "@/lib/admin-kit/types";

import { KitButton } from "./primitives";
import { FieldInput } from "./widgets";

function initialValue(field: FieldSchema, row: Row | null): unknown {
  if (row) {
    const value = row[field.name] as RowValue | undefined;
    if (field.type === "fk") {
      return value && typeof value === "object" && "value" in value
        ? String(value.value)
        : "";
    }
    if (field.type === "json")
      return value == null ? "" : JSON.stringify(value, null, 2);
    if (field.type === "boolean") return Boolean(value);
    return value ?? "";
  }
  if (field.default !== undefined)
    return field.type === "json"
      ? JSON.stringify(field.default)
      : field.default;
  return field.type === "boolean" ? false : "";
}

export function ModelForm({
  client,
  modelKey,
  meta,
  row,
  onClose,
  onSaved,
  onDeleted,
}: {
  client: AdminClient;
  modelKey: string;
  meta: ModelMeta;
  row: Row | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDeleted: (message: string) => void;
}) {
  const isCreate = row === null;
  const editable = useMemo(
    () => meta.form_fields.filter((f) => !f.read_only),
    [meta],
  );
  const visibleFields = isCreate ? editable : meta.form_fields;

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      visibleFields.map((f) => [f.name, initialValue(f, row)]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fkOptions, setFkOptions] = useState<Record<string, ChoiceOption[]>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    for (const field of editable) {
      if (field.type !== "fk") continue;
      client
        .autocomplete(modelKey, field.name)
        .then(({ results }) => {
          if (!cancelled)
            setFkOptions((prev) => ({ ...prev, [field.name]: results }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [client, modelKey, editable]);

  const submit = async () => {
    const payload: Record<string, unknown> = {};
    const clientErrors: Record<string, string> = {};

    for (const field of editable) {
      let value = values[field.name];
      if (field.type === "json") {
        const text = String(value ?? "").trim();
        if (text === "") continue; // omit → server default / unchanged
        try {
          value = JSON.parse(text);
        } catch {
          clientErrors[field.name] = "Invalid JSON.";
          continue;
        }
      }
      if (value === "" || value === null) {
        // Empty FK = explicit clear; empty non-text inputs are omitted so
        // server defaults apply (PATCH leaves them unchanged).
        if (field.type === "fk") {
          payload[field.name] = null;
          continue;
        }
        if (
          field.type !== "string" &&
          field.type !== "text" &&
          field.type !== "email" &&
          field.type !== "url"
        ) {
          continue;
        }
      }
      payload[field.name] = value;
    }

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setBusy(true);
    setErrors({});
    setFormError("");
    try {
      if (isCreate) {
        await client.create(modelKey, payload);
        onSaved(`${meta.label} created.`);
      } else {
        await client.update(modelKey, String(row[meta.pk_field]), payload);
        onSaved(`${meta.label} saved.`);
      }
    } catch (err) {
      if (err instanceof AdminKitError) {
        setErrors(err.fieldErrors);
        setFormError(err.detail);
      } else {
        setFormError("Request failed.");
      }
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!row) return;
    if (
      !window.confirm(
        `Delete this ${meta.label.toLowerCase()}? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setFormError("");
    try {
      await client.destroy(modelKey, String(row[meta.pk_field]));
      onDeleted(`${meta.label} deleted.`);
    } catch (err) {
      setFormError(
        err instanceof AdminKitError ? err.detail : "Delete failed.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {isCreate ? `New ${meta.label}` : `Edit ${meta.label}`}
          </h2>
          <KitButton
            variant="ghost"
            aria-label="Close panel"
            onClick={onClose}
            className="h-8 px-2"
          >
            <X className="h-4 w-4" />
          </KitButton>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {formError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}
          {visibleFields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(value) =>
                setValues((prev) => ({ ...prev, [field.name]: value }))
              }
              fkOptions={fkOptions[field.name]}
              error={errors[field.name]}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-4">
          {!isCreate && meta.can_delete ? (
            <KitButton variant="danger" onClick={remove} disabled={busy}>
              <Trash2 className="h-4 w-4" /> Delete
            </KitButton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <KitButton onClick={onClose} disabled={busy}>
              Cancel
            </KitButton>
            {(isCreate ? meta.can_create : meta.can_edit) && (
              <KitButton variant="primary" onClick={submit} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreate ? "Create" : "Save"}
              </KitButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
