"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { FocusStart } from "@/components/focus/focus-start";
import { WorkingTag } from "@/components/focus/working-tag";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavLink } from "@/components/ui/nav-link";
import { PageState } from "@/components/ui/page-state";
import { SkeletonForm } from "@/components/ui/skeletons";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ContentPicker,
  type Product,
  type SelectedItem,
} from "@/components/billing/content-picker";
import { clientFetch } from "@/lib/api-client";
import { useLiveRecord } from "@/lib/copilot/live";
import { startActiveTime } from "@/lib/focus/active-time";
import { fetchCreation } from "@/lib/focus/api";
import { focusTimeKey } from "@/lib/focus/kinds";
import { ownership } from "@/lib/focus/own-fields";
import {
  activeCreation,
  clearActiveCreation,
  openCreationFor,
  setActiveCreation,
  setFocusSave,
  useActiveCreation,
  useFocusOverview,
} from "@/lib/focus/store";
import { useTenantCurrency } from "@/lib/setup-assistant";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { useNavigate } from "@shared/navigation/navigation-provider";

const BACK = "/admin/store?tab=plans";

interface PlanDetail {
  id: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  billing_interval_months: number;
  is_active: boolean;
}

/** GET /billing/plans/<id>/access/: what the plan includes, in the shape PUT
 *  takes back, and all it could include (members-only content too). */
interface PlanContent {
  content_type: string;
  object_id: number;
  title: string;
  price: string;
  pricing_type: string;
  window_text: string;
}
interface PlanAccess {
  items: PlanContent[];
  available: PlanContent[];
}

type Cycle = "1" | "12" | "custom";

/** The plan as the form holds it; `Saved` is the server's last copy of it. */
interface Saved {
  name: string;
  description: string;
  price: string;
  is_active: boolean;
  cycle: Cycle;
  months: string;
  items: SelectedItem[];
}
const EMPTY: Saved = {
  name: "",
  description: "",
  price: "",
  is_active: true,
  cycle: "1",
  months: "3",
  items: [],
};
const savedOf = (plan: PlanDetail, access: PlanAccess): Saved => {
  const every = plan.billing_interval_months;
  return {
    name: plan.name,
    description: plan.description,
    price: plan.price,
    is_active: plan.is_active,
    cycle: every === 1 ? "1" : every === 12 ? "12" : "custom",
    months: String(every),
    items: access.items,
  };
};
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

/** `/admin/store/plans/new` with focus mode on for memberships asks one
 *  question at a time (her first answer makes the plan, off sale, and moves to
 *  its page); `?form=1`, or with it off, is the plain form. A plan's id edits it. */
export default function PlanPage() {
  const id = useParams().id as string;
  const plain = useSearchParams().get("form") === "1";
  const overview = useFocusOverview();
  if (id !== "new") return <PlanForm key={id} id={id} />;
  const first = overview?.first.membership;
  return (
    <PageState
      loading={overview === null}
      skeleton={<SkeletonForm fields={5} />}
    >
      {overview?.enabled && first && !plain ? (
        <FocusStart kind="membership" question={first}>
          <PlanSlots />
        </FocusStart>
      ) : (
        <PlanForm id={id} />
      )}
    </PageState>
  );
}

/** The membership page, still empty, before her first answer makes the plan. */
function PlanSlots() {
  const t = useTranslations("admin.store.plans");
  const slot = "rounded-md border border-dashed border-border bg-muted/30";
  return (
    <>
      <Card aria-hidden>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>{t("name")}</Label>
            <div className={`h-10 ${slot}`} />
          </div>
          <div className="space-y-2">
            <Label>{t("description")}</Label>
            <div className={`h-20 ${slot}`} />
          </div>
          <div className="space-y-2">
            <Label>{t("cycle")}</Label>
            <div className={`h-10 ${slot}`} />
          </div>
        </CardContent>
      </Card>
      <Card aria-hidden>
        <CardHeader>
          <CardTitle>{t("access")}</CardTitle>
          <CardDescription>{t("accessHint")}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}

function PlanForm({ id }: { id: string }) {
  const t = useTranslations("admin.store.plans");
  const tf = useTranslations("admin.focus");
  const navigate = useNavigate();
  const isNew = id === "new";
  const tenantCurrency = useTenantCurrency();

  const [form, setForm] = useState({
    name: EMPTY.name,
    description: EMPTY.description,
    price: EMPTY.price,
    is_active: EMPTY.is_active,
  });
  const [cycle, setCycle] = useState<Cycle>(EMPTY.cycle);
  const [months, setMonths] = useState(EMPTY.months);
  const [currency, setCurrency] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  // A new plan has no access payload yet; the picker loads the store's own.
  const [available, setAvailable] = useState<Product[] | undefined>();
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (isNew) clearActiveCreation(0); // from the focus screen's "Fill it in myself"
  }, [isNew]);

  // `base` is the plan as the server last had it: a newer copy (focus mode's
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
  const receive = (plan: PlanDetail, access: PlanAccess) => {
    const next = savedOf(plan, access);
    const was = base.current;
    base.current = next;
    lay({ name: next.name, description: next.description });
    setForm((now) => ({
      ...now,
      price: now.price === was.price ? next.price : now.price,
      is_active:
        now.is_active === was.is_active ? next.is_active : now.is_active,
    }));
    setCycle((now) => (now === was.cycle ? next.cycle : now));
    setMonths((now) => (now === was.months ? next.months : now));
    setSelectedItems((now) =>
      itemKeys(now) === itemKeys(was.items) ? next.items : now,
    );
    setCurrency(plan.currency);
    setAvailable(
      access.available.map((item) => ({
        id: item.object_id,
        type: item.content_type,
        title: item.title,
        price: item.price,
        pricing_type: item.pricing_type,
      })),
    );
  };
  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  const fetchPlan = useCallback(
    () =>
      Promise.all([
        clientFetch<PlanDetail>(`/api/v1/billing/plans/${id}/`),
        clientFetch<PlanAccess>(`/api/v1/billing/plans/${id}/access/`),
      ]),
    [id],
  );

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchPlan()
      .then(([plan, access]) => {
        if (!cancelled) receiveRef.current(plan, access);
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
  }, [isNew, fetchPlan, reloadKey]);
  // In focus mode: the saved plan again, without the skeleton.
  const reload = useCallback(() => {
    fetchPlan()
      .then(([plan, access]) => receiveRef.current(plan, access))
      .catch(() => {});
  }, [fetchPlan]);

  // Focus mode: a membership she is still making in it reopens there, where
  // she stopped; the guide and the page follow the creation from here.
  const overview = useFocusOverview();
  const creation = useActiveCreation();
  const planId = isNew ? undefined : Number(id);
  const ours =
    !!creation &&
    creation.kind === "membership" &&
    planId !== undefined &&
    creation.record?.id === planId;
  const creationId =
    planId === undefined
      ? null
      : (openCreationFor(overview, "membership", planId) ??
        (ours ? creation.id : null));
  useEffect(() => {
    if (!creationId) return;
    startActiveTime(focusTimeKey("membership"));
    // Just made on the new-membership page: the guide already holds it.
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

  // Each answer writes the plan on the server (what's included, its price and
  // cycle, on sale): the page loads it again, and once more when focus mode ends.
  const answeredKey = focusing
    ? [
        creation.question?.field,
        ...creation.answered.map((line) => `${line.field}:${line.label}`),
      ].join("|")
    : "";
  const answeredSeen = useRef(answeredKey);
  useEffect(() => {
    const was = answeredSeen.current;
    answeredSeen.current = answeredKey;
    // Focus mode taking the page up is no answer: the plan was just loaded.
    if (was && was !== answeredKey) reload();
  }, [answeredKey, reload]);

  // The copy run's name and description type in; only the field being written
  // is read-only, and a written value lands unless the field is hers.
  const live = useLiveRecord(focusing ? `membership:${id}` : "", runId);
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
    // Once it has all been shown, the saved plan takes over.
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
  // and nothing else (the guide's answers are saved already). On sale stays
  // the finish step's tap. What is saved is the server's copy from then on.
  const saveFocus = async () => {
    const was = base.current;
    const changes: Record<string, unknown> = {};
    const saved: Partial<Saved> = {};
    for (const name of OWN)
      if (OWN_TIDY[name](form[name]) !== was[name])
        changes[name] = saved[name] = OWN_TIDY[name](form[name]);
    if (form.price !== was.price) changes.price = saved.price = form.price;
    if (cycle !== was.cycle || months !== was.months) {
      changes.billing_interval_months =
        cycle === "custom" ? Number(months) : Number(cycle);
      Object.assign(saved, { cycle, months });
    }
    if (Object.keys(changes).length) {
      await clientFetch(`/api/v1/billing/plans/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      base.current = { ...base.current, ...saved };
    }
    if (itemKeys(selectedItems) !== itemKeys(was.items)) {
      const items = selectedItems;
      await clientFetch(`/api/v1/billing/plans/${id}/access/`, {
        method: "PUT",
        body: JSON.stringify({
          items: items.map((i) => ({
            content_type: i.content_type,
            object_id: i.object_id,
          })),
        }),
      });
      base.current = { ...base.current, items };
    }
  };
  const saveFocusRef = useRef(saveFocus);
  saveFocusRef.current = saveFocus;
  useEffect(() => {
    if (!focusing) return;
    setFocusSave(() => saveFocusRef.current());
    return () => setFocusSave(null);
  }, [focusing]);

  // Once created, a second save edits that plan: a plan cannot be deleted,
  // so a retry (the access step failed) must never make another one.
  const savedId = useRef<number | null>(isNew ? null : Number(id));
  // Stays true through the redirect, so the button cannot be pressed twice.
  const [leaving, setLeaving] = useState(false);

  const { run: save, loading: saving } = useAsyncAction(
    async () => {
      const body = JSON.stringify({
        ...form,
        billing_interval_months:
          cycle === "custom" ? Number(months) : Number(cycle),
      });
      const plan = await clientFetch<{ id: number }>(
        savedId.current === null
          ? "/api/v1/billing/plans/"
          : `/api/v1/billing/plans/${savedId.current}/`,
        { method: savedId.current === null ? "POST" : "PATCH", body },
      );
      savedId.current = plan.id;
      await clientFetch(`/api/v1/billing/plans/${plan.id}/access/`, {
        method: "PUT",
        body: JSON.stringify({
          items: selectedItems.map((i) => ({
            content_type: i.content_type,
            object_id: i.object_id,
          })),
        }),
      });
      toast.success(t(isNew ? "created" : "saved"));
      setLeaving(true);
      navigate(BACK);
    },
    { errorToast: t("saveError") },
  );

  return (
    <div className="space-y-6">
      {!focusing && (
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <NavLink href={BACK} aria-label={t("back")}>
              <ArrowLeft className="h-4 w-4" />
            </NavLink>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? t("new") : form.name || t("edit")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("formSubtitle")}</p>
          </div>
        </div>
      )}

      <PageState
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        skeleton={<SkeletonForm fields={5} />}
      >
        {/* Not a <form>: Enter in the content search below would submit it,
            and a plan made by accident is public at once and cannot be
            deleted. */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="plan-name">{t("name")}</Label>
                  {writing("name") && live?.working && (
                    <WorkingTag
                      specialist={live.working.specialist}
                      label={tf("writing")}
                    />
                  )}
                </div>
                <Input
                  id="plan-name"
                  placeholder={t("namePlaceholder")}
                  value={shown("name")}
                  readOnly={writing("name")}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="plan-description">{t("description")}</Label>
                  {writing("description") && live?.working && (
                    <WorkingTag
                      specialist={live.working.specialist}
                      label={tf("writing")}
                    />
                  )}
                </div>
                <Textarea
                  id="plan-description"
                  placeholder={t("descriptionPlaceholder")}
                  value={shown("description")}
                  readOnly={writing("description")}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plan-price">
                    {t("price", { currency: currency || tenantCurrency })}
                  </Label>
                  <Input
                    id="plan-price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-cycle">{t("cycle")}</Label>
                  <select
                    id="plan-cycle"
                    value={cycle}
                    onChange={(e) => setCycle(e.target.value as Cycle)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="1">{t("monthly")}</option>
                    <option value="12">{t("yearly")}</option>
                    <option value="custom">{t("custom")}</option>
                  </select>
                </div>
              </div>
              {cycle === "custom" && (
                <div className="space-y-2 sm:max-w-[50%]">
                  <Label htmlFor="plan-months">{t("months")}</Label>
                  <Input
                    id="plan-months"
                    type="number"
                    min="1"
                    max="36"
                    step="1"
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                  />
                </div>
              )}
              {!isNew && (
                <p className="text-xs text-muted-foreground">
                  {t("priceChangeHint")}
                </p>
              )}
              {/* In focus mode only the finish step's tap puts it on sale. */}
              {!focusing && (
                <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <div>
                    <Label htmlFor="plan-active">{t("onSale")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("onSaleHint")}
                    </p>
                  </div>
                  <Switch
                    id="plan-active"
                    checked={form.is_active}
                    onCheckedChange={(is_active) =>
                      setForm({ ...form, is_active })
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("access")}</CardTitle>
              <CardDescription>{t("accessHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ContentPicker
                selected={selectedItems}
                onChange={setSelectedItems}
                products={available}
              />
            </CardContent>
          </Card>

          {/* In focus mode: Save & leave in the top bar, and the guide's finish. */}
          {!focusing && (
            <div className="flex gap-3">
              <Button
                onClick={save}
                loading={saving || leaving}
                loadingText={t("saving")}
                disabled={
                  !form.name.trim() ||
                  !(Number(form.price) > 0) ||
                  (cycle === "custom" &&
                    !(Number(months) >= 1 && Number(months) <= 36))
                }
              >
                {t(isNew ? "create" : "save")}
              </Button>
              <Button variant="outline" asChild>
                <NavLink href={BACK}>{t("cancel")}</NavLink>
              </Button>
            </div>
          )}
        </div>
      </PageState>
    </div>
  );
}
