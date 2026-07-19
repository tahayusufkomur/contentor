"use client";

// Shared admin-kit (schema-driven admin renderer).
// Canonical shared module — imported via @shared/admin-kit/* by both frontend-main and frontend-customer.
//
// The full model page: header, search, filters, bulk actions, table, paging,
// and the slide-over form. Everything renders from the backend metadata.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, Loader2 } from "lucide-react";

import { AdminKitError, createAdminClient } from "./client";
import type {
  ActionSchema,
  ChoiceOption,
  ListPage,
  ModelMeta,
  Row,
} from "./types";

import { GalleryView } from "./gallery-view";
import { JsonRecordModal, type GalleryTarget } from "./json-record-modal";
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

/** A button-group filter that replaces the old dropdown. */
function ButtonSelectFilter({
  label,
  value,
  options,
  onChange,
  allLabel = "All",
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
  allLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border bg-card p-1 text-sm shadow-sm">
      <span className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}:</span>
      <button
        type="button"
        onClick={() => onChange("")}
        className={`rounded-sm px-2.5 py-1 transition-colors ${
          value === ""
            ? "bg-primary text-primary-foreground font-medium"
            : "text-foreground hover:bg-muted"
        }`}
      >
        {allLabel}
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-sm px-2.5 py-1 transition-colors ${
            value === opt.value
              ? "bg-primary text-primary-foreground font-medium"
              : "text-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function InfiniteScrollSentinel({ onIntersect, isFetching }: { onIntersect: () => void; isFetching: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const onIntersectRef = useRef(onIntersect);

  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetching) {
          onIntersectRef.current();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isFetching]);

  return (
    <div ref={ref} className="py-4 text-center text-sm text-muted-foreground flex justify-center">
      <span className="flex items-center gap-2 min-h-[1.5rem]">
         {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
         {isFetching ? "Loading more..." : ""}
      </span>
    </div>
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
  const [accumulatedResults, setAccumulatedResults] = useState<Row[]>([]);
  const [isFetchingList, setIsFetchingList] = useState(false);
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
  const [galleryTarget, setGalleryTarget] = useState<GalleryTarget | null>(
    null,
  );
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryUploadError, setGalleryUploadError] = useState("");
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [galleryServerError, setGalleryServerError] = useState("");
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
    setIsFetchingList(true);
    client
      .list(modelKey, { page: pageNum, q, ordering, filters })
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        if (pageNum === 1) {
          setAccumulatedResults(data.results);
          setSelected(new Set());
        } else {
          setAccumulatedResults((prev) => [...prev, ...data.results]);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof AdminKitError ? err.detail : "Failed to load rows.",
          );
      })
      .finally(() => {
        if (!cancelled) setIsFetchingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, modelKey, meta, pageNum, q, ordering, filters, refreshTick]);

  const refresh = useCallback(() => {
    setPageNum(1);
    setRefreshTick((tick) => tick + 1);
  }, []);

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

  // Gallery mode: upload the dropped/picked PNG through the image field's own
  // endpoint, then open the JSON modal prefilled for a create.
  const galleryUpload = async (file: File) => {
    if (!meta) return;
    const imageFieldSchema = meta.form_fields.find(
      (f) => f.name === meta.gallery_image_field,
    );
    if (!imageFieldSchema?.upload_url) return;
    setGalleryUploading(true);
    setGalleryUploadError("");
    try {
      const body = new FormData();
      body.append("file", file);
      if (imageFieldSchema.upload_prefix)
        body.append("prefix", imageFieldSchema.upload_prefix);
      const res = await fetch(imageFieldSchema.upload_url, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(data?.detail ?? `Upload failed (${res.status}).`);
      }
      const image = (await res.json()) as { key: string; url: string };
      setGalleryServerError("");
      setGalleryTarget({ mode: "create", image });
    } catch (err) {
      setGalleryUploadError(
        err instanceof Error ? err.message : "Upload failed.",
      );
    } finally {
      setGalleryUploading(false);
    }
  };

  const gallerySave = async (data: Record<string, unknown>) => {
    if (!meta || !galleryTarget) return;
    setGalleryBusy(true);
    setGalleryServerError("");
    try {
      if (galleryTarget.mode === "create") {
        await client.create(modelKey, {
          ...data,
          [meta.gallery_image_field ?? ""]: galleryTarget.image.key,
        });
        showBanner("success", `${meta.label} created.`);
      } else {
        await client.update(
          modelKey,
          String(galleryTarget.row[meta.pk_field]),
          data,
        );
        showBanner("success", `${meta.label} updated.`);
      }
      setGalleryTarget(null);
      refresh();
    } catch (err) {
      setGalleryServerError(
        err instanceof AdminKitError
          ? err.detail ||
              Object.entries(err.fieldErrors)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")
          : "Save failed.",
      );
    } finally {
      setGalleryBusy(false);
    }
  };

  const galleryDelete = async () => {
    if (!meta || galleryTarget?.mode !== "edit") return;
    setGalleryBusy(true);
    setGalleryServerError("");
    try {
      await client.destroy(modelKey, String(galleryTarget.row[meta.pk_field]));
      showBanner("success", `${meta.label} deleted.`);
      setGalleryTarget(null);
      refresh();
    } catch (err) {
      setGalleryServerError(
        err instanceof AdminKitError ? err.detail : "Delete failed.",
      );
    } finally {
      setGalleryBusy(false);
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
  const galleryMode = meta.list_mode === "gallery";
  const totalPages = page
    ? Math.max(1, Math.ceil(page.count / meta.page_size))
    : 1;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {meta.label_plural}
            </h1>
            {page && (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {page.count} {page.count === 1 ? meta.label.toLowerCase() : meta.label_plural.toLowerCase()}
              </span>
            )}
          </div>
          {meta.description && (
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {meta.description}
            </p>
          )}
        </div>
        {meta.can_create && !galleryMode && (
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
        {meta.filters.map((filter) => {
          if (filter.type === "string") {
            return (
              <StringFilter
                key={filter.name}
                label={filter.label}
                value={filters[filter.name] ?? ""}
                onApply={(value) => {
                  setFilters((prev) => ({ ...prev, [filter.name]: value }));
                  setPageNum(1);
                }}
              />
            );
          }

          const options = filter.type === "boolean"
            ? [{ label: "Yes", value: "true" }, { label: "No", value: "false" }]
            : (filter.choices ?? fkFilterOptions[filter.name] ?? []).map((o) => ({ label: o.label, value: String(o.value) }));

          return (
            <ButtonSelectFilter
              key={filter.name}
              label={filter.label}
              value={filters[filter.name] ?? ""}
              options={options}
              allLabel={filter.total_count !== undefined ? `All (${filter.total_count})` : "All"}
              onChange={(val) => {
                setFilters((prev) => ({
                  ...prev,
                  [filter.name]: val,
                }));
                setPageNum(1);
              }}
            />
          );
        })}
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
        ) : galleryMode ? (
          <GalleryView
            meta={meta}
            rows={accumulatedResults}
            uploading={galleryUploading}
            uploadError={galleryUploadError}
            onCardClick={(row) => {
              setGalleryServerError("");
              setGalleryTarget({ mode: "edit", row });
            }}
            onFile={galleryUpload}
          />
        ) : (
          <ModelList
            meta={meta}
            page={{ ...page, results: accumulatedResults }}
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
                const pks = accumulatedResults.map((row) =>
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

      {page && page.next && (
        <InfiniteScrollSentinel
          isFetching={isFetchingList}
          onIntersect={() => setPageNum((prev) => prev + 1)}
        />
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

      {galleryTarget && meta && page && (
        <JsonRecordModal
          // Remount on row switch so the modal's internal JSON-textarea
          // state reloads cleanly instead of carrying over stale edits.
          key={
            galleryTarget.mode === "edit"
              ? String(galleryTarget.row[meta.pk_field])
              : `create:${galleryTarget.image.key}`
          }
          meta={meta}
          target={galleryTarget}
          rows={accumulatedResults}
          busy={galleryBusy}
          serverError={galleryServerError}
          onSave={gallerySave}
          onDelete={galleryDelete}
          onClose={() => setGalleryTarget(null)}
          onNavigate={(row) => {
            setGalleryServerError("");
            setGalleryTarget({ mode: "edit", row });
          }}
          hasMore={!!page.next}
          onLoadMore={() => {
            if (!isFetchingList) setPageNum((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
