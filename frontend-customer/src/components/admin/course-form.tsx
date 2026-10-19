"use client";

import { useState, useCallback, useEffect, useRef, Fragment } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { PhotoPicker } from "@/components/admin/photo-picker";
import { OpenStudioButton } from "@/components/studio/open-studio-button";
import { VideoPicker } from "@/components/admin/video-picker";
import { FilterPicker } from "@/components/admin/filter-picker";
import { TagInput } from "@/components/admin/tag-input";
import {
  RichEditorProvider,
  useRichEditor,
} from "@/components/owner/rich-editor";
import { RichHtml } from "@/components/blocks/rich-html";
import { refreshSetupStatus } from "@/lib/setup-assistant";
import { formatDuration } from "@/lib/format";
import { MonetizeNudge } from "@/components/admin/monetize-nudge";
import {
  AccessSection,
  type AccessProblem,
} from "@/components/admin/access/access-section";
import { useAccess } from "@/lib/access/use-access";
import { parsePrice } from "@/lib/access/ways";
import { CoverStep } from "@/components/focus/cover-step";
import { courseItem } from "@/lib/covers/items";
import { LiveOutline } from "@/components/focus/live-outline";
import { WorkingTag } from "@/components/focus/working-tag";
import { stopRun } from "@/lib/copilot/api";
import { useLiveRecord } from "@/lib/copilot/live";
import { plainText, useLiveLessons } from "@/lib/focus/descriptions";
import { setFocusSave, useActiveCreation } from "@/lib/focus/store";
import type { Course, CourseDetail, Module, Lesson } from "@/types/course";
import type { Photo } from "@/types/photo";

interface NewLessonState {
  title: string;
  content_html: string;
  is_free_preview: boolean;
  video: number | null;
  videoPreviewUrl: string | null;
}

const EMPTY_LESSON: NewLessonState = {
  title: "",
  content_html: "",
  is_free_preview: false,
  video: null,
  videoPreviewUrl: null,
};

interface CourseFormProps {
  course?: CourseDetail | null;
  onCourseLoaded?: () => void;
  /** Focus mode: the record the outline run writes ("course:<id>") and that
   *  run, replayed live on this form. */
  focus?: {
    record: string;
    runId: number | null;
    /** The run typing each lesson's description (after "Looks good"). */
    descriptionsRunId: number | null;
  };
  /** Create mode: the course was created (before the page moves on). */
  onCreated?: (course: Course) => void;
}

/** The settings fields she edits by hand; a reload keeps her unsaved edits. */
const SETTINGS_FIELDS = [
  "title",
  "description",
  "thumbnail_url",
  "thumbnail_id",
  "thumbnail_signed_url",
  "is_published",
] as const;

/** The server's fresh copy, keeping every field she changed since the last
 *  one (``server``) and has not saved. */
function keepEdits(
  fresh: CourseDetail,
  mine: CourseDetail | null,
  server: CourseDetail | null,
): CourseDetail {
  if (!mine || !server) return fresh;
  const next = { ...fresh } as Record<string, unknown>;
  for (const key of SETTINGS_FIELDS)
    if (mine[key] !== server[key]) next[key] = mine[key];
  return next as unknown as CourseDetail;
}

/** What "Save" sends for the settings card, as one value, ids in any order. */
const settingsKey = (
  c: CourseDetail | null,
  filterIds: number[],
  tagIds: number[],
) =>
  JSON.stringify([
    c?.title,
    c?.description,
    c?.thumbnail_url,
    c?.thumbnail_id ?? null,
    c?.is_published,
    [...filterIds].sort(),
    [...tagIds].sort(),
  ]);

/** Why a save failed when the server refused to publish (a lesson with no
 *  video or text yet), or ``fallback``. */
export function saveError(err: unknown, fallback: string) {
  const why = err instanceof ApiError ? err.data.is_published : undefined;
  return Array.isArray(why) && typeof why[0] === "string" ? why[0] : fallback;
}

/** The creator's sentence from a refused access save, or "". */
const accessSentence = (err: unknown) =>
  err instanceof ApiError && typeof err.data.detail === "string"
    ? err.data.detail
    : "";

/** The same, as the server holds it. */
const savedKey = (c: CourseDetail | null) =>
  settingsKey(
    c,
    c?.filter_options?.map((o) => o.id) ?? [],
    c?.tags?.map((t) => t.id) ?? [],
  );

export function CourseForm({
  course: initialCourse,
  onCourseLoaded,
  focus,
  onCreated,
}: CourseFormProps) {
  const navigate = useNavigate();
  const t = useTranslations("admin");
  const isCreate = !initialCourse;
  const [course, setCourse] = useState<CourseDetail | null>(
    initialCourse ?? null,
  );
  const [filterOptionIds, setFilterOptionIds] = useState<number[]>(
    initialCourse?.filter_options?.map((o) => o.id) ?? [],
  );
  const [tagIds, setTagIds] = useState<number[]>(
    initialCourse?.tags?.map((t) => t.id) ?? [],
  );
  // What the server last gave for the settings card: she has unsaved edits when the card differs.
  const [saved, setSaved] = useState(() => savedKey(initialCourse ?? null));
  // How students get it: the Access section's ways, saved with the course.
  const access = useAccess("course", course?.id ?? null);
  const [accessProblems, setAccessProblems] = useState<AccessProblem[]>([]);
  const accessDirty =
    !!access.ways &&
    !!access.payload &&
    JSON.stringify(access.ways) !== JSON.stringify(access.payload.ways);
  const accessDirtyRef = useRef(accessDirty);
  accessDirtyRef.current = accessDirty;
  const unsaved =
    !isCreate &&
    (settingsKey(course, filterOptionIds, tagIds) !== saved || accessDirty);

  // Create-mode form state
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    is_published: false,
    thumbnail_url: "",
    thumbnail_id: null as string | null,
    thumbnail_signed_url: null as string | null,
  });

  // Create-mode local curriculum (owned children stay local until the one
  // atomic submit — see the design principle in the 2026-07-03 spec)
  interface LocalModule {
    tempId: number;
    title: string;
    lessons: NewLessonState[];
  }
  const [localModules, setLocalModules] = useState<LocalModule[]>([]);

  // Curriculum state
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [addingLessonForModule, setAddingLessonForModule] = useState<
    number | null
  >(null);
  // Create-mode: which local lesson is being edited ({module tempId, lesson index})
  const [editingLocal, setEditingLocal] = useState<{
    tempId: number;
    index: number;
  } | null>(null);
  const [newLesson, setNewLesson] = useState<NewLessonState>(EMPTY_LESSON);

  const slug = course?.slug;
  // The server's copy as the form last took it in: what she has changed
  // since is hers, and a reload keeps it.
  const server = useRef<CourseDetail | null>(initialCourse ?? null);

  const loadCourse = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await clientFetch<CourseDetail>(`/api/v1/courses/${slug}/`);
      const base = server.current;
      server.current = data;
      setCourse((mine) => keepEdits(data, mine, base));
      setSaved(savedKey(data));
      onCourseLoaded?.();
    } catch (err) {
      console.error(err);
    }
  }, [slug, onCourseLoaded]);

  // Focus mode: the outline run's title, description and modules appear on
  // the form as they are written. Only a field being written is read-only;
  // a written value lands in the form unless she changed that field herself.
  const live = useLiveRecord(focus?.record ?? "", focus?.runId ?? null);
  const taken = useRef<Record<string, string>>({});
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    taken.current = {};
  }, [focus?.runId]);
  useEffect(() => {
    if (!live) return;
    for (const name of ["title", "description"] as const) {
      const field = live.fields[name];
      if (!field || field.typing || taken.current[name] === field.value)
        continue;
      taken.current[name] = field.value;
      const base = server.current?.[name];
      if (server.current)
        server.current = { ...server.current, [name]: field.value };
      setCourse((mine) =>
        mine && mine[name] === base ? { ...mine, [name]: field.value } : mine,
      );
    }
    if (server.current) setSaved(savedKey(server.current));
    // Once it has all been shown, the saved modules take over the replay.
    if (live.settled && focus?.runId && loadedFor.current !== focus.runId) {
      loadedFor.current = focus.runId;
      void loadCourse();
    }
  }, [live, focus?.runId, loadCourse]);
  // The lesson descriptions typing in under each title, and a count with Stop
  // above the modules; the saved text takes over once it has all been shown.
  const lessons = useLiveLessons(focus?.descriptionsRunId ?? null);
  const [described, setDescribed] = useState<number | null>(null);
  const settledFor = useRef<number | null>(null);
  useEffect(() => {
    const run = focus?.descriptionsRunId;
    if (!lessons?.settled || !run || settledFor.current === run) return;
    settledFor.current = run;
    void loadCourse().then(() => setDescribed(run));
  }, [lessons?.settled, focus?.descriptionsRunId, loadCourse]);
  const typedLessons =
    lessons && described !== focus?.descriptionsRunId ? lessons.texts : {};
  const { run: stopDescriptions, loading: stoppingDescriptions } =
    useAsyncAction(async () => {
      if (focus?.descriptionsRunId) await stopRun(focus.descriptionsRunId);
    });
  const writing = (name: "title" | "description") =>
    live?.fields[name]?.typing ?? false;
  const shown = (name: "title" | "description") => {
    const field = live?.fields[name];
    return field && taken.current[name] !== field.value
      ? field.value
      : (course?.[name] ?? "");
  };
  // What a save sends: a field the outline wrote counts as written even
  // while it is still typing in (the server has it; the old value would
  // undo it), unless she changed that field herself.
  const landed = (name: "title" | "description") => {
    const written = live?.written[name];
    return written !== undefined &&
      taken.current[name] !== written &&
      course?.[name] === server.current?.[name]
      ? written
      : (course?.[name] ?? "");
  };
  const showLive =
    !!live && !live.settled && (live.working !== null || live.rows.length > 0);
  const [allDetails, setAllDetails] = useState(false);
  const detailsShown = !focus || allDetails;
  // The cover step: the Designer's drafts take the thumbnail's place, and
  // stay while her words for the photo are read (no question meanwhile).
  const creation = useActiveCreation();
  const atCover =
    !!focus &&
    !!creation &&
    (creation.question
      ? creation.question.field === "cover"
      : creation.steps.find((step) => !step.done)?.id === "cover");

  // The settings card as the server should keep it. After it, the server's
  // copy is the new base: what it normalised ("19" -> "19.00") is not hers.
  const reloadAccess = access.reload;
  const saveSettings = async () => {
    if (!course) return;
    await clientFetch(`/api/v1/courses/${slug}/`, {
      method: "PUT",
      body: JSON.stringify({
        title: landed("title"),
        description: landed("description"),
        thumbnail_url: course.thumbnail_url,
        thumbnail: course.thumbnail_id || null,
        is_published: course.is_published,
        filter_option_ids: filterOptionIds,
        tag_ids: tagIds,
      }),
    });
    await access.save(course.id);
    server.current = null;
    await loadCourse();
  };
  // Focus mode: "Save & leave" saves what she typed on the page first.
  const saveRef = useRef(saveSettings);
  saveRef.current = saveSettings;
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;
  const focusing = !!focus;
  useEffect(() => {
    if (!focusing) return;
    setFocusSave(() =>
      unsavedRef.current ? saveRef.current() : Promise.resolve(),
    );
    return () => setFocusSave(null);
  }, [focusing]);
  // When focus mode ends (published, kept), the form takes the course as
  // the server now has it, so a later save never undoes what it did.
  const wasFocusing = useRef(focusing);
  useEffect(() => {
    if (wasFocusing.current && !focusing) {
      void loadCourse();
      if (!accessDirtyRef.current) void reloadAccess();
    }
    wasFocusing.current = focusing;
  }, [focusing, loadCourse, reloadAccess]);
  // The cover and access steps change the course on the server: the form takes
  // that in (the kept cover shows at once), and a later save (Save & leave
  // with her typed edits) never puts the old ways back. Ways she changed
  // herself and has not saved stay hers.
  const settled = creation?.answered
    .filter((line) => line.field === "access" || line.field === "cover")
    .map((line) => `${line.field}:${line.label}`)
    .join("|");
  useEffect(() => {
    if (!focusing || !settled) return;
    void loadCourse();
    if (!accessDirtyRef.current) void reloadAccess();
  }, [settled, focusing, loadCourse, reloadAccess]);

  // --- Save all course fields ---
  const { run: handleSave, loading: saving } = useAsyncAction(
    async () => {
      if (accessProblems.length) {
        toast.error(accessProblems[0].text);
        return;
      }
      if (isCreate) {
        const created = await clientFetch<Course>("/api/v1/courses/", {
          method: "POST",
          body: JSON.stringify({
            title: createForm.title,
            description: createForm.description,
            is_published: createForm.is_published,
            thumbnail_url: createForm.thumbnail_url,
            thumbnail: createForm.thumbnail_id || null,
            filter_option_ids: filterOptionIds,
            tag_ids: tagIds,
            modules: localModules.map((m) => ({
              title: m.title,
              lessons: m.lessons.map((l) => ({
                title: l.title,
                content_html: l.content_html,
                is_free_preview: l.is_free_preview,
                ...(l.video ? { video: l.video } : {}),
              })),
            })),
          }),
        });
        // The course exists now: a refused access setting must not make a
        // retry create it twice, so say so and let her fix it on its page.
        try {
          await access.save(created.id);
        } catch (err) {
          toast.error(
            `Course created, but how students get it was not saved. ${accessSentence(err)}`,
          );
          onCreated?.(created);
          navigate(`/admin/courses/${created.slug}`);
          return;
        }
        toast.success(
          createForm.is_published
            ? "Course published"
            : "Course saved as a draft — add lessons, then publish",
        );
        void refreshSetupStatus();
        onCreated?.(created);
        navigate(`/admin/courses/${created.slug}`);
        return;
      }
      if (!course) return;
      await saveSettings();
      toast.success("Course saved");
      void refreshSetupStatus();
    },
    {
      onError: (err) =>
        toast.error(
          accessSentence(err) ||
            saveError(
              err,
              isCreate ? "Failed to create course" : "Failed to save course",
            ),
        ),
    },
  );

  // --- Module CRUD ---
  const { run: handleAddModule, loading: addingModule } = useAsyncAction(
    async () => {
      if (!newModuleTitle.trim() || !slug) return;
      await clientFetch(`/api/v1/courses/${slug}/modules/`, {
        method: "POST",
        body: JSON.stringify({ title: newModuleTitle }),
      });
      setNewModuleTitle("");
      toast.success("Module added");
      await loadCourse();
    },
    { errorToast: "Failed to add module" },
  );

  // --- Lesson CRUD ---
  const { run: handleSaveLesson, loading: savingLessonEdit } = useAsyncAction(
    async (lesson: Lesson, values: Record<string, unknown>) => {
      if (!slug) return;
      await clientFetch(`/api/v1/courses/${slug}/lessons/${lesson.id}/`, {
        method: "PUT",
        body: JSON.stringify({
          title: values.title,
          // The panel leaves the text out unless she changed it.
          ...("content_html" in values
            ? { content_html: values.content_html }
            : {}),
          is_free_preview: values.is_free_preview,
          ...(values.video ? { video: values.video } : { video: null }),
        }),
      });
      setEditingLessonId(null);
      toast.success("Lesson saved");
      await loadCourse();
    },
    { errorToast: "Failed to save lesson" },
  );

  const { run: handleCreateLesson, loading: savingLessonCreate } =
    useAsyncAction(
      async (moduleId: number) => {
        if (!slug || !newLesson.title.trim()) return;
        await clientFetch(
          `/api/v1/courses/${slug}/modules/${moduleId}/lessons/`,
          {
            method: "POST",
            body: JSON.stringify({
              title: newLesson.title,
              content_html: newLesson.content_html,
              is_free_preview: newLesson.is_free_preview,
              ...(newLesson.video ? { video: newLesson.video } : {}),
            }),
          },
        );
        setAddingLessonForModule(null);
        setNewLesson({
          title: "",
          content_html: "",
          is_free_preview: false,
          video: null,
          videoPreviewUrl: null,
        });
        toast.success("Lesson added");
        await loadCourse();
      },
      { errorToast: "Failed to add lesson" },
    );

  // --- Create-mode local curriculum (no API calls until submit) ---
  function addLocalModule() {
    if (!newModuleTitle.trim()) return;
    setLocalModules([
      ...localModules,
      { tempId: Date.now(), title: newModuleTitle.trim(), lessons: [] },
    ]);
    setNewModuleTitle("");
  }

  function removeLocalModule(tempId: number) {
    if (addingLessonForModule === tempId) setAddingLessonForModule(null);
    if (editingLocal?.tempId === tempId) setEditingLocal(null);
    setLocalModules(localModules.filter((m) => m.tempId !== tempId));
  }

  function addLocalLesson(tempId: number) {
    if (!newLesson.title.trim()) return;
    setLocalModules(
      localModules.map((m) =>
        m.tempId === tempId
          ? { ...m, lessons: [...m.lessons, { ...newLesson }] }
          : m,
      ),
    );
    setAddingLessonForModule(null);
    setNewLesson(EMPTY_LESSON);
  }

  function removeLocalLesson(tempId: number, lessonIndex: number) {
    if (editingLocal?.tempId === tempId) setEditingLocal(null);
    setLocalModules(
      localModules.map((m) =>
        m.tempId === tempId
          ? { ...m, lessons: m.lessons.filter((_, i) => i !== lessonIndex) }
          : m,
      ),
    );
  }

  function startLocalLessonEdit(
    tempId: number,
    index: number,
    lesson: NewLessonState,
  ) {
    setAddingLessonForModule(null);
    setNewLesson({ ...lesson });
    setEditingLocal({ tempId, index });
  }

  function saveLocalLessonEdit() {
    if (!editingLocal || !newLesson.title.trim()) return;
    setLocalModules(
      localModules.map((m) =>
        m.tempId === editingLocal.tempId
          ? {
              ...m,
              lessons: m.lessons.map((l, i) =>
                i === editingLocal.index ? { ...newLesson } : l,
              ),
            }
          : m,
      ),
    );
    setEditingLocal(null);
    setNewLesson(EMPTY_LESSON);
  }

  return (
    <RichEditorProvider>
      <div className="space-y-6">
        {/* ───── Course Details & Settings ───── */}
        <Card>
          {/* The create page already carries the "New Course" heading. */}
          {!isCreate && (
            <CardHeader>
              <CardTitle>Course Settings</CardTitle>
              <CardDescription>
                Update course details, pricing, and publishing.
              </CardDescription>
            </CardHeader>
          )}
          <CardContent className={isCreate ? "space-y-6 pt-6" : "space-y-6"}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="title">Title</Label>
                {writing("title") && live?.working && (
                  <WorkingTag
                    specialist={live.working.specialist}
                    label="writing"
                  />
                )}
              </div>
              <Input
                id="title"
                placeholder="e.g. Introduction to Photography"
                readOnly={writing("title")}
                value={isCreate ? createForm.title : shown("title")}
                onChange={(e) =>
                  isCreate
                    ? setCreateForm({ ...createForm, title: e.target.value })
                    : setCourse(
                        course ? { ...course, title: e.target.value } : course,
                      )
                }
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="description">Description</Label>
                {writing("description") && live?.working && (
                  <WorkingTag
                    specialist={live.working.specialist}
                    label="writing"
                  />
                )}
              </div>
              <Textarea
                id="description"
                placeholder="Describe what students will learn..."
                readOnly={writing("description")}
                value={isCreate ? createForm.description : shown("description")}
                onChange={(e) =>
                  isCreate
                    ? setCreateForm({
                        ...createForm,
                        description: e.target.value,
                      })
                    : setCourse(
                        course
                          ? { ...course, description: e.target.value }
                          : course,
                      )
                }
                className="min-h-[120px]"
              />
            </div>
            {atCover && creation && course ? (
              <CoverStep
                creationId={creation.id}
                cover={creation.cover}
                item={courseItem(course)}
              />
            ) : (
              <div className="space-y-2">
                <Label>Thumbnail</Label>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <PhotoPicker
                    value={
                      isCreate
                        ? createForm.thumbnail_url
                        : (course?.thumbnail_url ?? null)
                    }
                    previewUrl={
                      isCreate
                        ? createForm.thumbnail_signed_url
                        : course?.thumbnail_signed_url ||
                          course?.thumbnail_url ||
                          null
                    }
                    onSelect={(photo: Photo) => {
                      if (isCreate) {
                        setCreateForm({
                          ...createForm,
                          thumbnail_url: photo.s3_key,
                          thumbnail_id: photo.id,
                          thumbnail_signed_url: photo.signed_url,
                        });
                      } else if (course) {
                        setCourse({
                          ...course,
                          thumbnail_url: photo.s3_key,
                          thumbnail_id: photo.id,
                          thumbnail_signed_url: photo.signed_url ?? undefined,
                        });
                      }
                    }}
                    onClear={() => {
                      if (isCreate) {
                        setCreateForm({
                          ...createForm,
                          thumbnail_url: "",
                          thumbnail_id: null,
                          thumbnail_signed_url: null,
                        });
                      } else if (course) {
                        setCourse({
                          ...course,
                          thumbnail_url: "",
                          thumbnail_id: null,
                          thumbnail_signed_url: undefined,
                        });
                      }
                    }}
                    label="Choose thumbnail"
                  />
                  {!isCreate && course && (
                    <OpenStudioButton
                      target={{
                        target_kind: "course",
                        target_key: String(course.id),
                      }}
                      from={course.cover_design?.id}
                      unsaved={unsaved}
                    />
                  )}
                </div>
              </div>
            )}
            <AccessSection
              kind="course"
              value={access.ways}
              onChange={access.setWays}
              payload={access.payload}
              onProblems={setAccessProblems}
            />
            {access.error && (
              <p role="alert" className="text-xs text-destructive">
                {access.error}
              </p>
            )}
            <MonetizeNudge
              price={parsePrice(access.ways?.buy?.price ?? "") ?? undefined}
            />
            {focus && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 gap-1.5"
                aria-expanded={allDetails}
                onClick={() => setAllDetails((open) => !open)}
              >
                {allDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                All details
              </Button>
            )}
            {detailsShown && (
              <div className="flex items-center gap-3">
                <Switch
                  id="published"
                  checked={
                    isCreate
                      ? createForm.is_published
                      : (course?.is_published ?? false)
                  }
                  onCheckedChange={(checked) =>
                    isCreate
                      ? setCreateForm({ ...createForm, is_published: checked })
                      : setCourse(
                          course
                            ? { ...course, is_published: checked }
                            : course,
                        )
                  }
                />
                <Label htmlFor="published">
                  {isCreate ? "Publish immediately" : "Published"}
                </Label>
              </div>
            )}
            {detailsShown && (
              <div className="space-y-1.5">
                <Label>Filters</Label>
                <p className="text-xs text-muted-foreground">
                  Optional categories (level, style…) students can filter your
                  courses by.
                </p>
                <FilterPicker
                  value={filterOptionIds}
                  onChange={setFilterOptionIds}
                  scope="course"
                />
              </div>
            )}
            {detailsShown && (
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <TagInput value={tagIds} onChange={setTagIds} scope="course" />
              </div>
            )}
            {!isCreate && (
              <Button
                onClick={handleSave}
                loading={saving}
                loadingText="Saving…"
              >
                Save Changes
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ───── Curriculum (create mode: composed locally, submitted with the course) ───── */}
        {isCreate && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Curriculum</CardTitle>
                <CardDescription>
                  Add modules and lessons now — everything is created together
                  in one step.
                </CardDescription>
              </CardHeader>
            </Card>

            {localModules.map((mod, moduleIndex) => (
              <Card key={mod.tempId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Module {moduleIndex + 1}: {mod.title}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {mod.lessons.length} lesson
                        {mod.lessons.length !== 1 ? "s" : ""}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeLocalModule(mod.tempId)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mod.lessons.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Video</TableHead>
                          <TableHead>Preview</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mod.lessons.map((lesson, lessonIndex) => (
                          <Fragment key={lessonIndex}>
                            <TableRow>
                              <TableCell className="font-medium">
                                {lesson.title}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    lesson.video ? "success" : "secondary"
                                  }
                                >
                                  {lesson.video ? "Selected" : "No video"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {lesson.is_free_preview && (
                                  <Badge variant="outline">Free</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() =>
                                      editingLocal?.tempId === mod.tempId &&
                                      editingLocal?.index === lessonIndex
                                        ? setEditingLocal(null)
                                        : startLocalLessonEdit(
                                            mod.tempId,
                                            lessonIndex,
                                            lesson,
                                          )
                                    }
                                  >
                                    {editingLocal?.tempId === mod.tempId &&
                                    editingLocal?.index === lessonIndex ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <Pencil className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() =>
                                      removeLocalLesson(mod.tempId, lessonIndex)
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {editingLocal?.tempId === mod.tempId &&
                              editingLocal?.index === lessonIndex && (
                                <TableRow>
                                  <TableCell colSpan={4} className="p-0">
                                    <div className="p-2">
                                      <LessonCreatePanel
                                        newLesson={newLesson}
                                        setNewLesson={setNewLesson}
                                        onSave={saveLocalLessonEdit}
                                        onCancel={() => {
                                          setEditingLocal(null);
                                          setNewLesson(EMPTY_LESSON);
                                        }}
                                        saving={false}
                                        heading="Edit Lesson"
                                        saveLabel="Save"
                                      />
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {addingLessonForModule === mod.tempId ? (
                    <LessonCreatePanel
                      newLesson={newLesson}
                      setNewLesson={setNewLesson}
                      onSave={() => addLocalLesson(mod.tempId)}
                      onCancel={() => {
                        setAddingLessonForModule(null);
                        setNewLesson({
                          title: "",
                          content_html: "",
                          is_free_preview: false,
                          video: null,
                          videoPreviewUrl: null,
                        });
                      }}
                      saving={false}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setEditingLocal(null);
                        setNewLesson(EMPTY_LESSON);
                        setAddingLessonForModule(mod.tempId);
                      }}
                    >
                      <Plus className="h-4 w-4" /> Add Lesson
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}

            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="New module title"
                    value={newModuleTitle}
                    onChange={(e) => setNewModuleTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addLocalModule();
                    }}
                  />
                  <Button className="gap-2 shrink-0" onClick={addLocalModule}>
                    <Plus className="h-4 w-4" /> Add Module
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleSave}
              loading={saving}
              loadingText="Creating…"
              disabled={!createForm.title.trim()}
            >
              Create Course
            </Button>
          </>
        )}

        {/* ───── Curriculum ───── */}
        {!isCreate && course && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Curriculum</CardTitle>
                <CardDescription>
                  Organize your course into modules and lessons.
                </CardDescription>
              </CardHeader>
            </Card>

            {lessons?.working && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <WorkingTag
                  specialist="content"
                  label={t("focus.writingDescriptions")}
                />
                {t("focus.descriptionCount", {
                  done: lessons.done,
                  total: lessons.total,
                })}
                <Button
                  size="sm"
                  variant="outline"
                  loading={stoppingDescriptions}
                  onClick={stopDescriptions}
                >
                  {t("focus.stop")}
                </Button>
              </div>
            )}
            {showLive && live && <LiveOutline frame={live} />}
            {(showLive ? [] : course.modules).map((mod: Module) => (
              <Card key={mod.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Module {mod.order}: {mod.title}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {mod.lessons.length} lesson
                        {mod.lessons.length !== 1 ? "s" : ""}
                      </Badge>
                      <DeleteModuleButton
                        slug={slug}
                        moduleId={mod.id}
                        onDeleted={loadCourse}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mod.lessons.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Video</TableHead>
                          <TableHead>Preview</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mod.lessons.map((lesson) => (
                          <Fragment key={lesson.id}>
                            <TableRow>
                              <TableCell className="font-medium">
                                {lesson.title}
                                <LessonDescription
                                  typed={typedLessons[lesson.id]}
                                  html={lesson.content_html}
                                />
                              </TableCell>
                              <TableCell>
                                {formatDuration(lesson.duration_seconds)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    lesson.video_url ? "success" : "secondary"
                                  }
                                >
                                  {lesson.video_url ? "Uploaded" : "No video"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {lesson.is_free_preview && (
                                  <Badge variant="outline">Free</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={typedLessons[lesson.id]?.typing}
                                    onClick={() =>
                                      setEditingLessonId(
                                        editingLessonId === lesson.id
                                          ? null
                                          : lesson.id,
                                      )
                                    }
                                  >
                                    {editingLessonId === lesson.id ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <Pencil className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <DeleteLessonButton
                                    slug={slug}
                                    lessonId={lesson.id}
                                    onDeleted={loadCourse}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                            {editingLessonId === lesson.id && (
                              <TableRow>
                                <TableCell colSpan={5} className="p-0">
                                  <LessonEditPanel
                                    lesson={lesson}
                                    onSave={(values) =>
                                      handleSaveLesson(lesson, values)
                                    }
                                    onCancel={() => setEditingLessonId(null)}
                                    saving={savingLessonEdit}
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {addingLessonForModule === mod.id ? (
                    <LessonCreatePanel
                      newLesson={newLesson}
                      setNewLesson={setNewLesson}
                      onSave={() => handleCreateLesson(mod.id)}
                      onCancel={() => {
                        setAddingLessonForModule(null);
                        setNewLesson({
                          title: "",
                          content_html: "",
                          is_free_preview: false,
                          video: null,
                          videoPreviewUrl: null,
                        });
                      }}
                      saving={savingLessonCreate}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => setAddingLessonForModule(mod.id)}
                    >
                      <Plus className="h-4 w-4" /> Add Lesson
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}

            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="New module title"
                    value={newModuleTitle}
                    onChange={(e) => setNewModuleTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddModule();
                    }}
                  />
                  <Button
                    className="gap-2 shrink-0"
                    onClick={handleAddModule}
                    loading={addingModule}
                    loadingText="Adding…"
                  >
                    <Plus className="h-4 w-4" /> Add Module
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </RichEditorProvider>
  );
}

// ── Per-row delete actions (own useAsyncAction instances so rows don't
// share a loading flag — see the per-row gotcha in the retrofit brief) ──

function DeleteModuleButton({
  slug,
  moduleId,
  onDeleted,
}: {
  slug: string | undefined;
  moduleId: number;
  onDeleted: () => Promise<void>;
}) {
  const { run: handleDelete, loading } = useAsyncAction(
    async () => {
      if (!slug) return;
      await clientFetch(`/api/v1/courses/${slug}/modules/${moduleId}/`, {
        method: "DELETE",
      });
      toast.success("Module deleted");
      await onDeleted();
    },
    { errorToast: "Failed to delete module" },
  );

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      loading={loading}
      onClick={() => void handleDelete()}
    >
      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
    </Button>
  );
}

function DeleteLessonButton({
  slug,
  lessonId,
  onDeleted,
}: {
  slug: string | undefined;
  lessonId: number;
  onDeleted: () => Promise<void>;
}) {
  const { run: handleDelete, loading } = useAsyncAction(
    async () => {
      if (!slug) return;
      await clientFetch(`/api/v1/courses/${slug}/lessons/${lessonId}/`, {
        method: "DELETE",
      });
      toast.success("Lesson deleted");
      await onDeleted();
    },
    { errorToast: "Failed to delete lesson" },
  );

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      loading={loading}
      onClick={() => void handleDelete()}
    >
      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
    </Button>
  );
}

// ── Lesson content (rich text via the shared modal) ────────────

function LessonContentField({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useRichEditor();
  return (
    <button
      type="button"
      onClick={() =>
        editor?.openRichEditor({
          value,
          title: "Lesson content",
          onSave: onChange,
        })
      }
      className="block w-full rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/60"
    >
      {value ? (
        <RichHtml
          html={value}
          className="pointer-events-none max-h-40 overflow-hidden"
        />
      ) : (
        <span className="text-muted-foreground">
          Click to write lesson content…
        </span>
      )}
    </button>
  );
}

// ── Lesson Edit Panel (inline) ─────────────────────────────────

/** A lesson's description under its title: the text being typed (tagged),
 *  else the saved text as plain words. */
function LessonDescription({
  typed,
  html,
}: {
  typed: { value: string; typing: boolean } | undefined;
  html: string;
}) {
  const t = useTranslations("admin");
  const line = typed ? typed.value : plainText(html);
  if (!line) return null;
  return (
    <div className="mt-1 flex flex-wrap items-start gap-2">
      <p className="line-clamp-2 max-w-xs break-words text-xs font-normal text-muted-foreground">
        {line}
      </p>
      {typed?.typing && (
        <WorkingTag specialist="content" label={t("focus.writing")} />
      )}
    </div>
  );
}

interface LessonEditPanelProps {
  lesson: Lesson;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function LessonEditPanel({
  lesson,
  onSave,
  onCancel,
  saving,
}: LessonEditPanelProps) {
  const [values, setValues] = useState({
    title: lesson.title,
    content_html: lesson.content_html,
    is_free_preview: lesson.is_free_preview,
    video: lesson.video_id,
    videoPreviewUrl: lesson.video_signed_url,
  });
  const opened = useRef(lesson.content_html);

  return (
    <div className="border-t bg-muted/30 px-4 py-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Title</Label>
          <Input
            value={values.title}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
          />
        </div>
        <div className="flex items-end gap-3 pb-1">
          <div className="flex items-center gap-2">
            <Switch
              checked={values.is_free_preview}
              onCheckedChange={(v) =>
                setValues({ ...values, is_free_preview: v })
              }
            />
            <Label className="text-sm">Free Preview</Label>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Content</Label>
        <LessonContentField
          value={values.content_html}
          onChange={(html) => setValues({ ...values, content_html: html })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Video</Label>
        <VideoPicker
          value={values.video}
          previewUrl={values.videoPreviewUrl}
          onChange={(videoId, signedUrl) =>
            setValues({ ...values, video: videoId, videoPreviewUrl: signedUrl })
          }
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            // Only text she changed: an AI description that arrived after
            // this panel opened is not written over with the copy it opened with.
            const { content_html, ...rest } = values;
            onSave(content_html === opened.current ? rest : values);
          }}
          loading={saving}
          loadingText="Saving…"
          disabled={!values.title.trim()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

// ── Lesson Create Panel (inline) ───────────────────────────────

interface LessonCreatePanelProps {
  newLesson: NewLessonState;
  setNewLesson: (val: NewLessonState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  heading?: string;
  saveLabel?: string;
}

function LessonCreatePanel({
  newLesson,
  setNewLesson,
  onSave,
  onCancel,
  saving,
  heading = "New Lesson",
  saveLabel = "Add Lesson",
}: LessonCreatePanelProps) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-4 space-y-4">
      <p className="text-sm font-medium">{heading}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Title</Label>
          <Input
            value={newLesson.title}
            onChange={(e) =>
              setNewLesson({ ...newLesson, title: e.target.value })
            }
            placeholder="Lesson title"
          />
        </div>
        <div className="flex items-end gap-3 pb-1">
          <div className="flex items-center gap-2">
            <Switch
              checked={newLesson.is_free_preview}
              onCheckedChange={(v) =>
                setNewLesson({ ...newLesson, is_free_preview: v })
              }
            />
            <Label className="text-sm">Free Preview</Label>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Content</Label>
        <LessonContentField
          value={newLesson.content_html}
          onChange={(html) =>
            setNewLesson({ ...newLesson, content_html: html })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Video</Label>
        <VideoPicker
          value={newLesson.video}
          previewUrl={newLesson.videoPreviewUrl}
          onChange={(videoId, signedUrl) =>
            setNewLesson({
              ...newLesson,
              video: videoId,
              videoPreviewUrl: signedUrl,
            })
          }
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          loading={saving}
          loadingText={saveLabel === "Save" ? "Saving…" : "Adding…"}
          disabled={!newLesson.title.trim()}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
