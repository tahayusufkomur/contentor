"use client";

import { useTranslations, useLocale } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { Download, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NavLink } from "@/components/ui/nav-link";
import { TableCell } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import { formatFileSize, formatDate } from "@/lib/format";
import { getFileIcon, getExtension } from "@/lib/file-icons";
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from "@/components/admin/media-browser";
import { TagFilterBar } from "@/components/admin/tag-filter-bar";
import { CoverThumb } from "@/components/studio/cover-thumb";
import { listedItem } from "@/lib/covers/items";
import { KIND_ROUTES } from "@/lib/focus/kinds";
import { DemoBadge } from "@/components/setup/demo-badge";
import type { DownloadFile } from "@/types/download";

export const dynamic = "force-dynamic";

const ACCESS_BADGE_VARIANT: Record<string, "success" | "default" | "warning"> =
  {
    free: "success",
    paid: "default",
    subscription: "warning",
  };

export default function AdminDownloadsPage() {
  const locale = useLocale();
  const t = useTranslations("admin");
  const browserRef = useRef<MediaBrowserHandle>(null);
  const sortOptions = [
    { label: t("list.sort.newest"), value: "-created_at" },
    { label: t("list.sort.oldest"), value: "created_at" },
    { label: t("list.sort.nameAsc"), value: "title" },
    { label: t("list.sort.nameDesc"), value: "-title" },
    { label: t("list.sort.largest"), value: "-file_size" },
    { label: t("list.sort.smallest"), value: "file_size" },
  ];
  const [tagFilter, setTagFilter] = useState<number[]>([]);

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<DownloadFile>> => {
      const sp = new URLSearchParams();
      sp.set("limit", String(params.limit));
      sp.set("offset", String(params.offset));
      sp.set("ordering", params.ordering);
      if (params.search) sp.set("search", params.search);
      if (tagFilter.length) sp.set("tags", tagFilter.join(","));
      const data = await clientFetch<{
        results: DownloadFile[];
        next: string | null;
        count: number;
      }>(`/api/v1/downloads/?${sp.toString()}`);
      return { results: data.results, next: data.next, count: data.count };
    },
    [tagFilter],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("nav.items.downloads")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("downloads.subtitle")}
          </p>
        </div>
        <Button asChild className="gap-2">
          <NavLink
            href={KIND_ROUTES.download?.newHref ?? "/admin/downloads/new"}
          >
            <Plus className="h-4 w-4" />
            {t("downloads.upload")}
          </NavLink>
        </Button>
      </div>

      <MediaBrowser<DownloadFile>
        ref={browserRef}
        persistKey="downloads"
        fetchPage={fetchPage}
        filterKey={tagFilter.join(",")}
        filterSlot={
          <TagFilterBar
            scope="download"
            value={tagFilter}
            onChange={setTagFilter}
          />
        }
        sortOptions={sortOptions}
        defaultSort="-created_at"
        emptyIcon={Download}
        emptyMessage={t("downloads.empty")}
        getItemId={(dl) => dl.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map(
              (id) => () =>
                clientFetch(`/api/v1/downloads/${id}/`, { method: "DELETE" }),
            ),
          );
          toast.success(t("downloads.deletedMany"));
          browserRef.current?.refresh();
        }}
        listColumns={[
          { label: t("list.col.title"), key: "title" },
          { label: t("downloads.col.size"), key: "size" },
          { label: t("downloads.col.downloads"), key: "downloads" },
          { label: t("downloads.col.access"), key: "access" },
          { label: t("list.col.date"), key: "date" },
          { label: t("list.col.actions"), key: "actions" },
        ]}
        renderGalleryItem={(dl, _selected) => {
          const { icon: FileIcon, color } = getFileIcon(
            dl.file_url || dl.title,
          );
          const ext = getExtension(dl.file_url || dl.title);
          return (
            <NavLink
              href={`/admin/downloads/${dl.id}`}
              className="group block overflow-hidden rounded-lg border bg-card"
            >
              {dl.cover_design || dl.thumbnail_signed_url ? (
                <CoverThumb
                  design={dl.cover_design}
                  photoUrl={dl.thumbnail_signed_url}
                  item={listedItem(dl)}
                  className="rounded-none border-0"
                />
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center bg-muted gap-1">
                  <FileIcon className={`h-10 w-10 ${color}`} />
                  {ext && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {ext}
                    </span>
                  )}
                </div>
              )}
              <div className="p-3 space-y-2">
                <div className="font-medium truncate">
                  {dl.title}
                  <DemoBadge type="downloads" id={dl.id} />
                </div>
                <div className="flex items-center gap-2">
                  {!dl.is_published && <DraftBadge />}
                  <Badge variant={ACCESS_BADGE_VARIANT[dl.pricing_type]}>
                    {dl.pricing_type === "free"
                      ? t("list.pricing.free")
                      : dl.pricing_type === "paid"
                        ? t("list.pricing.paid")
                        : t("list.pricing.subscription")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {t("downloads.count", { count: dl.download_count })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatFileSize(dl.file_size)}</span>
                  <span>{formatDate(dl.created_at, locale)}</span>
                </div>
              </div>
            </NavLink>
          );
        }}
        renderListRow={(dl) => (
          <>
            <TableCell className="font-medium">
              <div className="flex items-center gap-3">
                {(dl.cover_design || dl.thumbnail_signed_url) && (
                  <CoverThumb
                    design={dl.cover_design}
                    photoUrl={dl.thumbnail_signed_url}
                    item={listedItem(dl)}
                    className="w-16 shrink-0"
                  />
                )}
                <NavLink
                  href={`/admin/downloads/${dl.id}`}
                  className="hover:underline"
                >
                  {dl.title}
                </NavLink>
                <DemoBadge type="downloads" id={dl.id} />
                {!dl.is_published && <DraftBadge />}
              </div>
            </TableCell>
            <TableCell>{formatFileSize(dl.file_size)}</TableCell>
            <TableCell>{dl.download_count}</TableCell>
            <TableCell>
              <Badge variant={ACCESS_BADGE_VARIANT[dl.pricing_type]}>
                {dl.pricing_type === "free"
                  ? t("list.pricing.free")
                  : dl.pricing_type === "paid"
                    ? t("list.pricing.paid")
                    : t("list.pricing.subscription")}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(dl.created_at, locale)}</TableCell>
            <TableCell>
              <DownloadRowActions
                download={dl}
                onDeleted={() => browserRef.current?.refresh()}
              />
            </TableCell>
          </>
        )}
      />
    </div>
  );
}

function DownloadRowActions({
  download,
  onDeleted,
}: {
  download: DownloadFile;
  onDeleted: () => void;
}) {
  const t = useTranslations("admin");
  const { run: handleDelete, loading: deleting } = useAsyncAction(
    async () => {
      if (
        !window.confirm(t("downloads.confirmDelete", { title: download.title }))
      )
        return;
      await clientFetch(`/api/v1/downloads/${download.id}/`, {
        method: "DELETE",
      });
      toast.success(t("downloads.deletedOne"));
      onDeleted();
    },
    { errorToast: t("downloads.deleteError") },
  );
  // `file_url` is the storage key, not an address: ask for a signed link.
  const { run: openFile, loading: opening } = useAsyncAction(
    async () => {
      // Opened inside the click: a tab opened after the request is a popup
      // to Safari, which blocks it.
      const tab = window.open("", "_blank");
      try {
        const { url } = await clientFetch<{ url: string }>(
          `/api/v1/downloads/${download.id}/url/`,
        );
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          window.location.href = url;
        }
      } catch (err) {
        tab?.close();
        throw err;
      }
    },
    { errorToast: t("downloads.openError") },
  );

  return (
    <div className="flex items-center gap-1">
      {download.file_url && (
        <Button
          size="sm"
          variant="ghost"
          loading={opening}
          onClick={openFile}
          aria-label={t("downloads.openFile")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button asChild size="sm" variant="ghost">
        <NavLink
          href={`/admin/downloads/${download.id}`}
          aria-label={t("list.edit")}
        >
          <Pencil className="h-3.5 w-3.5" />
        </NavLink>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={deleting}
        onClick={handleDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** A download focus mode is still making: students do not see it yet. */
function DraftBadge() {
  const t = useTranslations("admin.downloads");
  return <Badge variant="outline">{t("draft")}</Badge>;
}
