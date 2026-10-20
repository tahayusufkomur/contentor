"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { WorkingTag } from "@/components/focus/working-tag";
import { Badge } from "@/components/ui/badge";
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
import { NavLink } from "@/components/ui/nav-link";
import { Separator } from "@/components/ui/separator";
import { PageState } from "@/components/ui/page-state";
import { SkeletonForm } from "@/components/ui/skeletons";
import { clientFetch } from "@/lib/api-client";
import {
  ContentPicker,
  type SelectedItem,
} from "@/components/billing/content-picker";
import type { Bundle } from "@/types/billing";
import { formatMoney } from "@/lib/format";
import { useTenantCurrency } from "@/lib/setup-assistant";
import {
  AccessSection,
  type AccessProblem,
} from "@/components/admin/access/access-section";
import { useAccess } from "@/lib/access/use-access";
import { parsePrice } from "@/lib/access/ways";
import { useLiveRecord } from "@/lib/copilot/live";
import { startActiveTime } from "@/lib/focus/active-time";
import { fetchCreation } from "@/lib/focus/api";
import { focusTimeKey } from "@/lib/focus/kinds";
import { ownership } from "@/lib/focus/own-fields";
import {
  activeCreation,
  openCreationFor,
  setActiveCreation,
  setFocusSave,
  useActiveCreation,
  useFocusOverview,
} from "@/lib/focus/store";
import { ApiError } from "@/types/api";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

const BACK = "/admin/store?tab=bundles";

interface Product {
  id: number;
  title: string;
  type: string;
  price: string;
}

const CONTENT_TYPE_NAME_MAP: Record<string, SelectedItem["content_type"]> = {
  "courses.course": "course",
  "downloads.downloadfile": "download",
  "live.liveclass": "live_class",
  "live.livestream": "live_stream",
  "live.onsiteevent": "onsite_event",
};

function normalizeBundleItemType(
  contentTypeName?: string,
  contentTypeId?: number,
): SelectedItem["content_type"] {
  if (contentTypeName) {
    const mapped = CONTENT_TYPE_NAME_MAP[contentTypeName];
    if (mapped) return mapped;
    if (
      contentTypeName === "course" ||
      contentTypeName === "download" ||
      contentTypeName === "live_class" ||
      contentTypeName === "live_stream" ||
      contentTypeName === "onsite_event"
    ) {
      return contentTypeName;
    }
  }
  return String(contentTypeId ?? "");
}

/** The creator's sentence from a refused save ("Add at least two items."), or "". */
const accessSentence = (err: unknown) => {
  if (!(err instanceof ApiError)) return "";
  const { detail, is_published: publish } = err.data as {
    detail?: unknown;
    is_published?: unknown;
  };
  if (typeof detail === "string") return detail;
  return Array.isArray(publish) && typeof publish[0] === "string"
    ? publish[0]
    : "";
};

/** The bundle as the form holds it; `base` is the server's last copy of it. */
interface Saved {
  name: string;
  description: string;
  items: SelectedItem[];
}
const EMPTY: Saved = { name: "", description: "", items: [] };
const itemKeys = (items: SelectedItem[]) =>
  items.map((i) => `${i.content_type}:${i.object_id}`).join(",");

/** The name and description she and the copy run both write (focus mode). */
const OWN_TIDY = {
  name: (value: string) => value.trim(),
  description: (value: string) => value,
};
type OwnName = keyof typeof OWN_TIDY;
const OWN = Object.keys(OWN_TIDY) as OwnName[];
const { isHers, isWriting, layOver } = ownership(OWN_TIDY);

/** A bundle's page. While she makes it in focus mode (the owner's), the guide
 *  asks one question at a time and the page fills in; outside it, a draft
 *  shows its badge and Publish once it is ready. */
export default function EditBundlePage() {
  const t = useTranslations("admin.store.bundles");
  const tf = useTranslations("admin.focus");
  const navigate = useNavigate();
  const currency = useTenantCurrency();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({
    name: EMPTY.name,
    description: EMPTY.description,
  });
  // How people buy it: the Access section's price and window.
  const access = useAccess("bundle", Number(id));
  const [accessProblems, setAccessProblems] = useState<AccessProblem[]>([]);
  const accessDirty =
    !!access.ways &&
    !!access.payload &&
    JSON.stringify(access.ways) !== JSON.stringify(access.payload.ways);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [initialOriginalPrice, setInitialOriginalPrice] = useState<
    number | null
  >(null);
  // As saved: a draft (focus mode's, or kept) is published by Publish below,
  // once the server says it is ready (its own count: a series once, no held sessions).
  const [saved, setSaved] = useState({ published: true, notReady: "" });

  const originalPrice = useMemo(() => {
    const total = selectedItems.reduce(
      (sum, item) => sum + parseFloat(item.price || "0"),
      0,
    );
    const hasRealItemPrices = selectedItems.some(
      (item) => parseFloat(item.price || "0") > 0,
    );
    if (!hasRealItemPrices && initialOriginalPrice !== null)
      return initialOriginalPrice.toFixed(2);
    return total.toFixed(2);
  }, [selectedItems, initialOriginalPrice]);

  // `base` is the bundle as the server last had it: a newer copy (focus mode's
  // answers write it) takes every field she has not changed. The name and
  // description each also remember the copy they were last GIVEN (`placed`):
  // one that differs is hers, and no copy or replay ever replaces it.
  const base = useRef<Saved>(EMPTY);
  const placed = useRef({ name: EMPTY.name, description: EMPTY.description });
  const mine = useRef(placed.current);
  mine.current = { name: form.name, description: form.description };
  const lay = (next: typeof placed.current) => {
    const laid = layOver(mine.current, placed.current, next);
    placed.current = laid.placed;
    if (OWN.some((name) => laid.form[name] !== mine.current[name]))
      setForm((now) => ({ ...now, ...laid.form }));
  };
  const receive = (bundle: Bundle, products: Product[]) => {
    const productMap = new Map(
      products.map((p) => [`${p.type}:${p.id}`, p] as const),
    );
    const items = (bundle.items ?? []).map((item) => {
      const normalizedType = normalizeBundleItemType(
        item.content_type_name,
        item.content_type,
      );
      const product = productMap.get(`${normalizedType}:${item.object_id}`);
      return {
        content_type: normalizedType,
        object_id: item.object_id,
        title: product?.title ?? `Item ${item.object_id}`,
        price: product?.price ?? "0",
      };
    });
    const was = base.current;
    base.current = {
      name: bundle.name,
      description: bundle.description ?? "",
      items,
    };
    lay({ name: bundle.name, description: bundle.description ?? "" });
    setSelectedItems((now) =>
      itemKeys(now) === itemKeys(was.items) ? items : now,
    );
    const parsedOriginalPrice = Number.parseFloat(bundle.original_price ?? "");
    setInitialOriginalPrice(
      Number.isFinite(parsedOriginalPrice) ? parsedOriginalPrice : null,
    );
    setSaved({
      published: bundle.is_published !== false,
      notReady: bundle.not_ready ?? "",
    });
  };
  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  const fetchBundle = useCallback(
    () =>
      Promise.all([
        clientFetch<Bundle>(`/api/v1/billing/bundles/${id}/`),
        clientFetch<Product[]>("/api/v1/billing/products/"),
      ]),
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchBundle()
      .then(([bundle, products]) => {
        if (!cancelled) receiveRef.current(bundle, products);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchBundle, reloadKey]);
  // In focus mode: the saved bundle again, without the skeleton; its price
  // too, unless she is changing it on the page.
  const accessDirtyRef = useRef(accessDirty);
  accessDirtyRef.current = accessDirty;
  const reloadAccess = access.reload;
  const reload = useCallback(() => {
    fetchBundle()
      .then(([bundle, products]) => receiveRef.current(bundle, products))
      .catch(() => {});
    if (!accessDirtyRef.current) void reloadAccess();
  }, [fetchBundle, reloadAccess]);

  // Focus mode: a bundle she is still making in it reopens there, where she
  // stopped; the guide and the page follow the creation from here.
  const overview = useFocusOverview();
  const creation = useActiveCreation();
  const bundleId = Number(id);
  const ours =
    !!creation &&
    creation.kind === "bundle" &&
    creation.record?.id === bundleId;
  const creationId =
    openCreationFor(overview, "bundle", bundleId) ??
    (ours ? creation.id : null);
  useEffect(() => {
    if (!creationId) return;
    startActiveTime(focusTimeKey("bundle"));
    // Just made on the new-bundle page: the guide already holds it.
    if (activeCreation()?.id === creationId) return;
    let cancelled = false;
    fetchCreation(creationId)
      .then((state) => {
        if (!cancelled && state.status === "active") setActiveCreation(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creationId]);
  const focusing = ours && creation.id !== 0;
  const copy = focusing ? creation.copy : null;
  // A failed or stopped run is not replayed: the page keeps what is saved.
  const runId =
    copy?.status === "building" || copy?.status === "ready" ? copy.run : null;

  // Each answer writes the bundle on the server (its items, its price,
  // published): the page loads it again, and once more when focus mode ends.
  // Set while her first answer is still read, so its price landing loads it too.
  const answeredKey = focusing
    ? [
        "focus",
        creation.question?.field,
        ...creation.answered.map((line) => `${line.field}:${line.label}`),
      ].join("|")
    : "";
  const answeredSeen = useRef(answeredKey);
  useEffect(() => {
    const was = answeredSeen.current;
    answeredSeen.current = answeredKey;
    // Focus mode taking the page up is no answer: the bundle was just loaded.
    if (was && was !== answeredKey) reload();
  }, [answeredKey, reload]);

  // The copy run's name and description type in; only the field being written
  // is read-only, and a written value lands unless the field is hers.
  const live = useLiveRecord(focusing ? `bundle:${id}` : "", runId);
  const taken = useRef<Record<string, string>>({});
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    taken.current = {};
  }, [runId]);
  useEffect(() => {
    if (!live) return;
    for (const name of OWN) {
      const field = live.fields[name];
      if (!field || field.typing || taken.current[name] === field.value)
        continue;
      taken.current[name] = field.value;
      if (isHers(name, mine.current[name], placed.current[name])) continue;
      const value = OWN_TIDY[name](field.value);
      base.current = { ...base.current, [name]: value };
      lay({ ...placed.current, [name]: value });
    }
    // Once it has all been shown, the saved bundle takes over.
    if (live.settled && runId && loadedFor.current !== runId) {
      loadedFor.current = runId;
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lay` only reads refs
  }, [live, runId]);
  const writing = (name: OwnName) =>
    isWriting(
      name,
      live?.fields[name]?.typing ?? false,
      mine.current[name],
      placed.current[name],
    );
  const shown = (name: OwnName) =>
    writing(name) ? (live?.fields[name]?.value ?? "") : form[name];

  // "Save & leave", and before her finish taps: what she changed on the page,
  // and nothing else (the guide's answers are saved already). Publishing
  // stays the finish step's tap. What is saved is the server's copy from then on.
  const saveFocus = async () => {
    const was = base.current;
    const changes: Record<string, unknown> = {};
    const kept: Partial<Saved> = {};
    for (const name of OWN)
      if (OWN_TIDY[name](form[name]) !== was[name])
        changes[name] = kept[name] = OWN_TIDY[name](form[name]);
    if (itemKeys(selectedItems) !== itemKeys(was.items)) {
      changes.items = selectedItems.map((i) => ({
        content_type: i.content_type,
        object_id: i.object_id,
      }));
      kept.items = selectedItems;
    }
    if (Object.keys(changes).length) {
      await clientFetch(`/api/v1/billing/bundles/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      base.current = { ...base.current, ...kept };
    }
    if (accessDirty) await access.save(bundleId);
  };
  const saveFocusRef = useRef(saveFocus);
  saveFocusRef.current = saveFocus;
  useEffect(() => {
    if (!focusing) return;
    setFocusSave(() => saveFocusRef.current());
    return () => setFocusSave(null);
  }, [focusing]);

  const { run: handleSave, loading: saving } = useAsyncAction(
    async () => {
      const price = parsePrice(access.ways?.buy?.price ?? "");
      if (accessProblems.length || !price) {
        toast.error(accessProblems[0]?.text ?? "Add a price above 0.");
        return;
      }
      await clientFetch<Bundle>(`/api/v1/billing/bundles/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          price,
          items: selectedItems.map((i) => ({
            content_type: i.content_type,
            object_id: i.object_id,
          })),
        }),
      });
      if (accessDirty) await access.save(bundleId);
      toast.success("Bundle updated successfully.");
      navigate(BACK);
    },
    {
      onError: (err) =>
        toast.error(
          accessSentence(err) || "Failed to update bundle. Please try again.",
        ),
    },
  );

  // A kept draft, published from here once it has two items and a price (else
  // the line says what it still needs); the server refuses it as the finish
  // would (not ready, or selling not open yet). What the page shows is what
  // goes live: her changes on it are saved first.
  const { run: publish, loading: publishing } = useAsyncAction(
    async () => {
      if (accessProblems.length) {
        toast.error(accessProblems[0].text);
        return;
      }
      await saveFocus();
      await clientFetch<Bundle>(`/api/v1/billing/bundles/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_published: true }),
      });
      setSaved({ published: true, notReady: "" });
      toast.success(t("published"));
    },
    {
      onError: (err) =>
        toast.error(accessSentence(err) || "Could not publish the bundle."),
    },
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (focusing) return; // the guide's finish, and Save & leave
    if (selectedItems.length === 0) {
      toast.error("Please select at least one item for the bundle.");
      return;
    }
    handleSave();
  }

  return (
    <div className="space-y-6">
      {!focusing && (
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <NavLink href={BACK}>
              <ArrowLeft className="h-4 w-4" />
            </NavLink>
          </Button>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              Edit Bundle
              {!loading && !saved.published && (
                <Badge variant="outline">{t("draft")}</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {!loading && !saved.published
                ? t("draftHint")
                : "Update the details and items for this bundle."}
            </p>
          </div>
          {!loading &&
            !saved.published &&
            (saved.notReady ? (
              <p className="text-sm text-muted-foreground">{`${saved.notReady}.`}</p>
            ) : (
              <Button
                loading={publishing}
                loadingText={t("publishing")}
                onClick={publish}
              >
                {t("publish")}
              </Button>
            ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <PageState
          loading={loading}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          className="space-y-6"
          skeleton={<SkeletonForm fields={4} />}
        >
          <Card>
            <CardHeader>
              <CardTitle>Bundle Details</CardTitle>
              <CardDescription>
                Basic information about your bundle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="name">Name</Label>
                    {writing("name") && live?.working && (
                      <WorkingTag
                        specialist={live.working.specialist}
                        label={tf("writing")}
                      />
                    )}
                  </div>
                  <Input
                    id="name"
                    placeholder="e.g. Starter Pack"
                    value={shown("name")}
                    readOnly={writing("name")}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="description">Description</Label>
                    {writing("description") && live?.working && (
                      <WorkingTag
                        specialist={live.working.specialist}
                        label={tf("writing")}
                      />
                    )}
                  </div>
                  <textarea
                    id="description"
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Describe what's included in this bundle..."
                    value={shown("description")}
                    readOnly={writing("description")}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 sm:max-w-xs">
                  <Label>Original Price (sum of items)</Label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                    {formatMoney(originalPrice, currency)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <AccessSection
            kind="bundle"
            value={access.ways}
            onChange={access.setWays}
            payload={access.payload}
            onProblems={setAccessProblems}
            // The guide asks the price: 0 is not an error until it has.
            quietZeroPrice={focusing}
          />
          {access.error && (
            <p role="alert" className="text-xs text-destructive">
              {access.error}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Bundle Items</CardTitle>
              <CardDescription>
                Select the content to include in this bundle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContentPicker
                selected={selectedItems}
                onChange={setSelectedItems}
              />
            </CardContent>
          </Card>
        </PageState>

        {/* In focus mode: Save & leave in the top bar, and the guide's finish. */}
        {!focusing && (
          <>
            <Separator />
            <div className="flex gap-3">
              <Button
                type="submit"
                loading={saving}
                loadingText="Saving…"
                disabled={loading}
              >
                Save Changes
              </Button>
              <Button type="button" variant="outline" asChild>
                <NavLink href={BACK}>Cancel</NavLink>
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
