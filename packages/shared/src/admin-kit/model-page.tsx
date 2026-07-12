"use client";

// Shared admin-kit (schema-driven admin renderer).
// Canonical shared module — imported via @shared/admin-kit/* by both frontend-main and frontend-customer.
//
// The full model page: header, search, filters, bulk actions, table, paging,
// and the slide-over form. Everything renders from the backend metadata.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";

import { AdminKitError, createAdminClient } from "./client";
import type {
  ActionSchema,
  ChoiceOption,
  ListPage,
  ModelMeta,
  Row,
} from "./types";

import { ModelForm } from "./model-form";
import { ModelList } from "./model-list";
import {
  KitBanner,
  KitButton,
  KitInput,
  KitSelect,
  KitSkeletonRows,
} from "./primitives";

type FormTarget = { mode: "create" } | { mode: "edit"; row: Row } | null;

/** Exact-match text filter, debounced like search. */
function StringFilter({
  label,
  value,
  onApply,
}: {
  label: string;
  value: string;
  onApply: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => {
      if (text !== value) onApply(text);
    }, 400);
    return () => clearTimeout(handle);
  }, [text, value, onApply]);
  return (
    <KitInput
      aria-label={label}
      placeholder={`${label} (exact)`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      className="w-auto min-w-[9rem] max-w-[12rem]"
    />
  );
}

export function AdminModelPage({
  apiBase,
  modelKey,
}: {
  apiBase: string;
  modelKey: string;
}) {
  const client = useMemo(() => createAdminClient(apiBase), [apiBase]);

  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [page, setPage] = useState<ListPage | null>(null);
  const [loadError, setLoadError] = useState("");
  const [banner, setBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [ordering, setOrdering] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<FormTarget>(null);
  const [fkFilterOptions, setFkFilterOptions] = useState<
    Record<string, ChoiceOption[]>
  >({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyAction, setBusyAction] = useState("");
  const [busyRowAction, setBusyRowAction] = useState("");

  // Debounced search.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(qInput);
      setPageNum(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [qInput]);

  useEffect(() => {
    let cancelled = false;
    client
      .modelMeta(modelKey)
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        setOrdering(m.default_ordering);
        for (const filter of m.filters) {
          if (filter.type !== "fk") continue;
          client
            .autocomplete(modelKey, filter.name)
            .then(({ results }) => {
              if (!cancelled)
                setFkFilterOptions((prev) => ({
                  ...prev,
                  [filter.name]: results,
                }));
            })
            .catch(() => undefined);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof AdminKitError ? err.detail : "Failed to load model.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client, modelKey]);

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    client
      .list(modelKey, { page: pageNum, q, ordering, filters })
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        setSelected(new Set());
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof AdminKitError ? err.detail : "Failed to load rows.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client, modelKey, meta, pageNum, q, ordering, filters, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  // Keep one banner at a time; auto-dismiss successes.
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBanner = useCallback(
    (kind: "success" | "error", message: string) => {
      setBanner({ kind, message });
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      if (kind === "success")
        bannerTimer.current = setTimeout(() => setBanner(null), 4000);
    },
    [],
  );

  // A successful action may carry {detail, redirect}. A redirect (e.g. an
  // impersonation hand-off) wins — navigate instead of refreshing the table.
  const applyActionResult = (result: {
    detail?: string;
    redirect?: string;
  }) => {
    if (result.redirect) {
      window.location.href = result.redirect;
      return;
    }
    showBanner("success", result.detail ?? "Done.");
    refresh();
  };

  const runBulkAction = async (name: string) => {
    if (!meta) return;
    const action = meta.actions.find((a) => a.name === name);
    if (!action || selected.size === 0) return;
    if (action.confirm && !window.confirm(action.confirm)) return;
    setBusyAction(name);
    try {
      applyActionResult(
        await client.runAction(modelKey, name, Array.from(selected)),
      );
    } catch (err) {
      showBanner(
        "error",
        err instanceof AdminKitError ? err.detail : "Action failed.",
      );
    } finally {
      setBusyAction("");
    }
  };

  const runRowAction = async (action: ActionSchema, row: Row) => {
    if (!meta) return;
    if (action.confirm && !window.confirm(action.confirm)) return;
    const pk = String(row[meta.pk_field]);
    setBusyRowAction(`${action.name}:${pk}`);
    try {
      applyActionResult(await client.runAction(modelKey, action.name, [pk]));
    } catch (err) {
      showBanner(
        "error",
        err instanceof AdminKitError ? err.detail : "Action failed.",
      );
    } finally {
      setBusyRowAction("");
    }
  };

  if (loadError) {
    return (
      <div className="p-4 md:p-6">
        <KitBanner
          kind="error"
          message={loadError}
          onDismiss={() => setLoadError("")}
        />
      </div>
    );
  }

  if (!meta) {
    return <KitSkeletonRows rows={6} />;
  }

  const bulkActions = meta.actions.filter((a) => !a.row);
  const rowActions = meta.actions.filter((a) => a.row);
  const selectable = bulkActions.length > 0;
  const totalPages = page
    ? Math.max(1, Math.ceil(page.count / meta.page_size))
    : 1;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {meta.label_plural}
          </h1>
          {meta.description && (
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {meta.description}
            </p>
          )}
        </div>
        {meta.can_create && (
          <KitButton
            variant="primary"
            onClick={() => setForm({ mode: "create" })}
          >
            <Plus className="h-4 w-4" /> New {meta.label}
          </KitButton>
        )}
      </div>

      {banner && (
        <KitBanner
          kind={banner.kind}
          message={banner.message}
          onDismiss={() => setBanner(null)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {meta.search_enabled && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <KitInput
              placeholder={`Search ${meta.label_plural.toLowerCase()}…`}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
        {meta.filters.map((filter) =>
          filter.type === "string" ? (
            <StringFilter
              key={filter.name}
              label={filter.label}
              value={filters[filter.name] ?? ""}
              onApply={(value) => {
                setFilters((prev) => ({ ...prev, [filter.name]: value }));
                setPageNum(1);
              }}
            />
          ) : (
            <KitSelect
              key={filter.name}
              aria-label={filter.label}
              value={filters[filter.name] ?? ""}
              onChange={(e) => {
                setFilters((prev) => ({
                  ...prev,
                  [filter.name]: e.target.value,
                }));
                setPageNum(1);
              }}
              className="w-auto min-w-[9rem]"
            >
              <option value="">{filter.label}: all</option>
              {filter.type === "boolean" ? (
                <>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </>
              ) : (
                (filter.choices ?? fkFilterOptions[filter.name] ?? []).map(
                  (option) => (
                    <option
                      key={String(option.value)}
                      value={String(option.value)}
                    >
                      {option.label}
                    </option>
                  ),
                )
              )}
            </KitSelect>
          ),
        )}
      </div>

      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          {bulkActions.map((action) => (
            <KitButton
              key={action.name}
              variant={
                action.style === "danger"
                  ? "danger"
                  : action.style === "primary"
                    ? "primary"
                    : "default"
              }
              onClick={() => runBulkAction(action.name)}
              disabled={busyAction !== ""}
              className="h-8"
            >
              {action.label}
            </KitButton>
          ))}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {page === null ? (
          <KitSkeletonRows />
        ) : (
          <ModelList
            meta={meta}
            page={page}
            ordering={ordering}
            onOrdering={(next) => {
              setOrdering(next);
              setPageNum(1);
            }}
            selected={selected}
            onToggleRow={(pk) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(pk)) next.delete(pk);
                else next.add(pk);
                return next;
              })
            }
            onToggleAll={() =>
              setSelected((prev) => {
                const pks = page.results.map((row) =>
                  String(row[meta.pk_field]),
                );
                return pks.every((pk) => prev.has(pk))
                  ? new Set()
                  : new Set(pks);
              })
            }
            onRowClick={(row) => setForm({ mode: "edit", row })}
            onRowAction={runRowAction}
            rowActions={rowActions}
            selectable={selectable}
            busyRowAction={busyRowAction}
          />
        )}
      </div>

      {page && page.count > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {page.count}{" "}
            {(page.count === 1 ? meta.label : meta.label_plural).toLowerCase()}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <KitButton
                className="h-8 px-2"
                disabled={pageNum <= 1}
                onClick={() => setPageNum(pageNum - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </KitButton>
              <span>
                Page {pageNum} of {totalPages}
              </span>
              <KitButton
                className="h-8 px-2"
                disabled={pageNum >= totalPages}
                onClick={() => setPageNum(pageNum + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </KitButton>
            </div>
          )}
        </div>
      )}

      {form && (
        <ModelForm
          client={client}
          modelKey={modelKey}
          meta={meta}
          row={form.mode === "edit" ? form.row : null}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            showBanner("success", message);
            refresh();
          }}
          onDeleted={(message) => {
            setForm(null);
            showBanner("success", message);
            refresh();
          }}
        />
      )}
    </div>
  );
}
