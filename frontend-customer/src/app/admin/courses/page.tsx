"use client";

import { useTranslations, useLocale } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Pencil, Plus } from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
  type BulkSelection,
} from "@/components/admin/media-browser";
import {
  InlineEditPanel,
  type FieldConfig,
} from "@/components/admin/inline-edit-panel";
import { TagFilterBar } from "@/components/admin/tag-filter-bar";
import { DescribeIt } from "@/components/admin/describe-it";
import { useAssistantApplied } from "@/lib/site-events";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { DemoBadge } from "@/components/setup/demo-badge";
import { CoverArt } from "@/components/covers/cover-art";
import { LookFonts } from "@/components/covers/look-fonts";
import { courseItem } from "@/lib/covers/items";
import { saveError } from "@/components/admin/course-form";
import { formatMoney } from "@/lib/format";
import { useTenantCurrency } from "@/lib/setup-assistant";
import type { Course } from "@/types/course";

export const dynamic = "force-dynamic";

export default function AdminCoursesPage() {
  const locale = useLocale();
  const t = useTranslations("admin");
  const navigate = useNavigate();
  const currency = useTenantCurrency();
  const browserRef = useRef<MediaBrowserHandle>(null);
  const sortOptions = [
    { label: t("list.sort.newest"), value: "-created_at" },
    { label: t("list.sort.oldest"), value: "created_at" },
    { label: t("list.sort.nameAsc"), value: "title" },
    { label: t("list.sort.nameDesc"), value: "-title" },
  ];
  const courseFields = useMemo<FieldConfig<Course>[]>(
    () => [
      // Price and access live in the course's Access section: an echoed pricing type here would drop its windows.
      {
        key: "title",
        label: t("list.col.title"),
        type: "text",
        required: true,
      },
      {
        key: "is_published",
        label: t("list.status.published"),
        type: "toggle",
      },
      {
        key: "thumbnail_id",
        label: t("courses.thumbnail"),
        type: "image",
        previewUrlKey: "thumbnail_signed_url",
      },
    ],
    [t],
  );
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<number[]>([]);
  // The look of the kept covers on the page: their fonts are not loaded on this screen by itself.
  const [coverLook, setCoverLook] = useState<string | null>(null);
  // The assistant's panel created, changed or took back a course.
  useAssistantApplied(({ kind }) => {
    if (kind.includes("course") || kind.includes("curriculum")) {
      browserRef.current?.refresh();
    }
  });

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<Course>> => {
      const sp = new URLSearchParams();
      sp.set("limit", String(params.limit));
      sp.set("offset", String(params.offset));
      sp.set("ordering", params.ordering);
      if (params.search) sp.set("search", params.search);
      if (tagFilter.length) sp.set("tags", tagFilter.join(","));
      const data = await clientFetch<
        { results: Course[]; next: string | null; count: number } | Course[]
      >(`/api/v1/courses/?${sp.toString()}`);

      const rows = Array.isArray(data) ? data : data.results;
      const look = rows.find((c) => c.cover_design)?.cover_design?.look;
      if (look) setCoverLook(look);
      if (Array.isArray(data)) {
        return { results: data, next: null, count: data.length };
      }
      return { results: data.results, next: data.next, count: data.count };
    },
    [tagFilter],
  );

  async function handleBulkDelete(selection: BulkSelection) {
    await batchedAsync(
      selection.ids.map(
        (slug) => () =>
          clientFetch(`/api/v1/courses/${slug}/`, { method: "DELETE" }).catch(
            () => {},
          ),
      ),
    );
    toast.success(t("courses.deleted"));
    browserRef.current?.refresh();
  }

  const { run: handleInlineUpdate, loading: saving } = useAsyncAction(
    async (values: Record<string, unknown>) => {
      await clientFetch(`/api/v1/courses/${editingSlug}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          is_published: values.is_published,
          ...(values.thumbnail_id ? { thumbnail: values.thumbnail_id } : {}),
        }),
      });
      toast.success(t("courses.updated"));
      setEditingSlug(null);
      browserRef.current?.refresh();
    },
    {
      onError: (err) => toast.error(saveError(err, t("courses.updateError"))),
    },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("nav.items.courses")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("courses.subtitle")}
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/admin/courses/new">
            <Plus className="h-4 w-4" />
            {t("courses.new")}
          </Link>
        </Button>
      </div>

      {/* The drafted course opens in its editor, where she reviews it. */}
      <DescribeIt
        kind="course"
        onApplied={(result) => result.url && navigate(result.url)}
      />

      <MediaBrowser<Course>
        ref={browserRef}
        persistKey="courses"
        fetchPage={fetchPage}
        filterKey={tagFilter.join(",")}
        filterSlot={
          <TagFilterBar
            scope="course"
            value={tagFilter}
            onChange={setTagFilter}
          />
        }
        sortOptions={sortOptions}
        defaultSort="-created_at"
        emptyIcon={BookOpen}
        emptyMessage={t("courses.empty")}
        getItemId={(c) => c.slug}
        onDelete={handleBulkDelete}
        listColumns={[
          { label: t("list.col.title"), key: "title" },
          { label: t("list.col.status"), key: "status" },
          { label: t("courses.col.pricing"), key: "pricing" },
          { label: t("courses.col.lessons"), key: "lessons" },
          { label: t("list.col.actions"), key: "actions" },
        ]}
        renderGalleryItem={(course, _selected) => (
          <Link
            href={`/admin/courses/${course.slug}`}
            className="group block overflow-hidden rounded-lg border bg-card"
          >
            {course.cover_design ? (
              <div className="relative aspect-video overflow-hidden bg-muted">
                <CoverArt
                  design={course.cover_design}
                  item={courseItem(course)}
                  photoClassName="transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ) : course.thumbnail_signed_url ? (
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img
                  src={course.thumbnail_signed_url}
                  alt={course.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted">
                <BookOpen className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="p-3 space-y-2">
              <div className="font-medium truncate">
                {course.title}
                <DemoBadge type="courses" id={course.id} />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={course.is_published ? "success" : "secondary"}>
                  {course.is_published
                    ? t("list.status.published")
                    : t("list.status.draft")}
                </Badge>
                <Badge
                  variant={
                    course.pricing_type === "free" ? "outline" : "default"
                  }
                >
                  {course.pricing_type === "free"
                    ? t("list.pricing.free")
                    : course.pricing_type === "paid"
                      ? formatMoney(course.price, currency, locale)
                      : t("list.pricing.subscription")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t("courses.lessonCount", {
                    count: course.lesson_count ?? 0,
                  })}
                </span>
              </div>
            </div>
          </Link>
        )}
        renderListRow={(course) => (
          <>
            <TableCell className="font-medium">
              {course.title}
              <DemoBadge type="courses" id={course.id} />
            </TableCell>
            <TableCell>
              <Badge variant={course.is_published ? "success" : "secondary"}>
                {course.is_published
                  ? t("list.status.published")
                  : t("list.status.draft")}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={course.pricing_type === "free" ? "outline" : "default"}
              >
                {course.pricing_type === "free"
                  ? t("list.pricing.free")
                  : course.pricing_type === "paid"
                    ? formatMoney(course.price, currency, locale)
                    : t("list.pricing.subscription")}
              </Badge>
            </TableCell>
            <TableCell>{course.lesson_count ?? 0}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingSlug(course.slug)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button asChild variant="ghost" size="icon">
                  <Link href={`/admin/courses/${course.slug}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </TableCell>
          </>
        )}
        renderExpandedRow={(course) =>
          editingSlug === course.slug ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <InlineEditPanel
                  item={course}
                  fields={courseFields}
                  onSave={handleInlineUpdate}
                  onCancel={() => setEditingSlug(null)}
                  saving={saving}
                />
              </TableCell>
            </TableRow>
          ) : null
        }
      />
      {coverLook && <LookFonts look={coverLook} />}
    </div>
  );
}
