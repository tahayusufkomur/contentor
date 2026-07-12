"use client";

// Shared admin-kit (schema-driven admin renderer).
// Canonical copy: frontend-customer. After editing, run scripts/sync-admin-kit.sh
// to mirror into frontend-main — the two copies must stay byte-identical.
//
// Presentational table: columns, sorting, selection. State lives in ModelPage.

import { ArrowDown, ArrowUp, Inbox } from "lucide-react";

import type { ActionSchema, ListPage, ModelMeta, Row } from "./types";

import { KitButton } from "./primitives";
import { CellValue } from "./widgets";

export function ModelList({
  meta,
  page,
  ordering,
  onOrdering,
  selected,
  onToggleRow,
  onToggleAll,
  onRowClick,
  onRowAction,
  rowActions,
  selectable,
  busyRowAction,
}: {
  meta: ModelMeta;
  page: ListPage;
  ordering: string;
  onOrdering: (ordering: string) => void;
  selected: Set<string>;
  onToggleRow: (pk: string) => void;
  onToggleAll: () => void;
  onRowClick: (row: Row) => void;
  onRowAction: (action: ActionSchema, row: Row) => void;
  rowActions: ActionSchema[];
  selectable: boolean;
  busyRowAction: string;
}) {
  const rows = page.results;
  const orderingField = ordering.replace(/^-/, "");
  const descending = ordering.startsWith("-");

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <Inbox className="h-8 w-8" />
        <p className="text-sm">No {meta.label_plural.toLowerCase()} found.</p>
      </div>
    );
  }

  const allSelected =
    rows.length > 0 &&
    rows.every((row) => selected.has(String(row[meta.pk_field])));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
              </th>
            )}
            {meta.list_display.map((column) => (
              <th
                key={column.name}
                className="px-4 py-3 font-medium text-muted-foreground"
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOrdering(
                        orderingField === column.name && !descending
                          ? `-${column.name}`
                          : column.name,
                      )
                    }
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    {column.label}
                    {orderingField === column.name &&
                      (descending ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUp className="h-3 w-3" />
                      ))}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
            {rowActions.length > 0 && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pk = String(row[meta.pk_field]);
            return (
              <tr
                key={pk}
                onClick={() => onRowClick(row)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
              >
                {selectable && (
                  <td
                    className="px-4 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select row ${pk}`}
                      checked={selected.has(pk)}
                      onChange={() => onToggleRow(pk)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                  </td>
                )}
                {meta.list_display.map((column) => (
                  <td key={column.name} className="px-4 py-2.5">
                    <CellValue column={column} value={row[column.name]} />
                  </td>
                ))}
                {rowActions.length > 0 && (
                  <td
                    className="px-4 py-2.5 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-2">
                      {rowActions.map((action) => (
                        <KitButton
                          key={action.name}
                          variant={
                            action.style === "danger"
                              ? "danger"
                              : action.style === "primary"
                                ? "primary"
                                : "default"
                          }
                          onClick={() => onRowAction(action, row)}
                          disabled={busyRowAction !== ""}
                          className="h-8"
                        >
                          {action.label}
                        </KitButton>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
