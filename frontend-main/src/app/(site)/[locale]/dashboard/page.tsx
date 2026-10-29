import { redirect } from "next/navigation";
import { ArrowUpRight, Clock, Globe2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleNavLink } from "@/i18n/navigation";
import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { Monogram } from "@/components/shared/logo-mark";
import { getAuthUser } from "@/lib/auth";
import { getMyTenants, type MyTenant } from "@/lib/tenants";
import { PublishControls } from "@/components/dashboard/publish-controls";
import { PlatformCardDomainCta } from "@/components/dashboard/platform-card-domain-cta";
import { DeletePlatform } from "@/components/dashboard/delete-platform";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedHref } from "@/lib/locale-href";
import { nativeName } from "@shared/i18n/locales";

/** Status as a coloured dot and a word (spec 5.5). Token colours only:
 * chart-2 is the system's green, marketing-accent its brass. */
const STATUS: Record<
  MyTenant["provisioning_status"],
  { key: "live" | "settingUp" | "pending" | "setupFailed"; dot: string }
> = {
  ready: { key: "live", dot: "bg-chart-2" },
  provisioning: { key: "settingUp", dot: "bg-marketing-accent" },
  provisioned: { key: "settingUp", dot: "bg-marketing-accent" },
  pending: { key: "pending", dot: "bg-muted-foreground" },
  failed: { key: "setupFailed", dot: "bg-destructive" },
};

function PlatformCard({ tenant }: { tenant: MyTenant }) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  // Fallback: an unknown backend value must never 500 the dashboard.
  const status = STATUS[tenant.provisioning_status] ?? STATUS.pending;
  const isReady = tenant.provisioning_status === "ready" && tenant.is_active;
  const statusLabel = t(`status.${status.key}`);

  return (
    <div className="flex flex-col rounded-tile border bg-card p-7">
      <div className="flex items-start justify-between gap-3">
        <Monogram
          size={48}
          label={(tenant.name || tenant.slug || "C")
            .charAt(0)
            .toLocaleUpperCase(locale)}
        />
        <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
          <span aria-hidden className={`size-2 rounded-full ${status.dot}`} />
          {statusLabel}
        </span>
      </div>

      <h3 className="mt-5 text-title-2 text-foreground">{tenant.name}</h3>
      <p className="mt-1 inline-flex items-center gap-1.5 text-caption text-muted-foreground">
        <Globe2 className="size-3.5" />
        {tenant.domain || `${tenant.slug}.contentor.app`}
      </p>

      <div className="mt-5 flex items-center gap-4 text-caption text-muted-foreground">
        <span>
          {t("plan")}{" "}
          <span className="font-medium text-foreground">
            {tenant.plan_name ?? t("freePlan")}
          </span>
        </span>
        <span>
          {t("language")}{" "}
          <span className="font-medium text-foreground">
            {nativeName(tenant.language)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {new Date(tenant.created_at).toLocaleDateString(locale, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        {isReady ? (
          <Button
            asChild
            variant="brand"
            size="sm"
            className="gap-1.5 rounded-full"
          >
            <a href={tenant.studio_url}>
              {t("openStudio")}
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="rounded-full" disabled>
            {statusLabel}
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <a href={tenant.studio_url}>{t("preview")}</a>
        </Button>
        <PlatformCardDomainCta slug={tenant.slug} />
        <DeletePlatform
          slug={tenant.slug}
          name={tenant.name}
          blocker={tenant.delete_blocker}
        />
      </div>

      {isReady && (
        <PublishControls
          slug={tenant.slug}
          initialPublished={tenant.is_published}
          initialHasPassword={tenant.has_preview_password}
        />
      )}
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("dashboard");
  return (
    <div className="mx-auto max-w-2xl rounded-tile border bg-card p-12 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-muted">
        <Sparkles className="size-7 text-foreground" />
      </div>
      <h2 className="mt-6 text-title-2 text-foreground">{t("emptyTitle")}</h2>
      <p className="mx-auto mt-3 max-w-md text-body text-muted-foreground">
        {t("emptyBody")}
      </p>
      <Button
        asChild
        variant="brand"
        size="lg"
        className="mt-7 gap-2 rounded-full"
      >
        <LocaleNavLink href="/signup">
          <Plus className="size-4" />
          {t("newPlatform")}
        </LocaleNavLink>
      </Button>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect(localizedHref("/login", await getLocale()));
  // Superadmins live in /admin — keep this surface coach-only.
  if (user.is_superuser) redirect("/admin");

  const tenants = await getMyTenants();
  const t = await getTranslations("dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      <section className="px-6 pb-12 pt-20 md:pt-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-eyebrow text-muted-foreground">
              {user.name
                ? t("greeting", { name: user.name.split(" ")[0] })
                : t("greetingFallback")}
            </p>
            <h1 className="mt-3 text-title text-foreground">{t("title")}</h1>
            <p className="mt-4 max-w-xl text-body text-muted-foreground">
              {t("intro")}
            </p>
          </div>

          {tenants.length > 0 && (
            <Button
              asChild
              variant="brand"
              size="lg"
              className="gap-2 rounded-full"
            >
              <LocaleNavLink href="/signup">
                <Plus className="size-4" />
                {t("newPlatform")}
              </LocaleNavLink>
            </Button>
          )}
        </div>
      </section>

      <section className="flex-1 bg-muted px-6 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          {tenants.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {tenants.map((tenant) => (
                <PlatformCard key={tenant.id} tenant={tenant} />
              ))}
            </div>
          )}
        </div>
      </section>

      <PlatformFooter flush />
    </div>
  );
}
