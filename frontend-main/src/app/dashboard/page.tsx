import { redirect } from "next/navigation";
import { ArrowUpRight, Clock, Globe2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { PlatformHeader } from "@/components/shared/platform-header";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { Monogram } from "@/components/shared/logo-mark";
import { getAuthUser } from "@/lib/auth";
import { getMyTenants, type MyTenant } from "@/lib/tenants";
import { PublishControls } from "@/components/dashboard/publish-controls";
import { PlatformCardDomainCta } from "@/components/dashboard/platform-card-domain-cta";
import { DeletePlatform } from "@/components/dashboard/delete-platform";
import { useLocale } from "next-intl";

/** Status as a coloured dot and a word (spec 5.5). Token colours only:
 * chart-2 is the system's green, marketing-accent its brass. */
const STATUS: Record<
  MyTenant["provisioning_status"],
  { label: string; dot: string }
> = {
  ready: { label: "Live", dot: "bg-chart-2" },
  provisioning: { label: "Setting up", dot: "bg-marketing-accent" },
  provisioned: { label: "Setting up", dot: "bg-marketing-accent" },
  pending: { label: "Pending", dot: "bg-muted-foreground" },
  failed: { label: "Setup failed", dot: "bg-destructive" },
};

function PlatformCard({ tenant }: { tenant: MyTenant }) {
  const locale = useLocale();
  // Fallback: an unknown backend value must never 500 the dashboard.
  const status = STATUS[tenant.provisioning_status] ?? STATUS.pending;
  const isReady = tenant.provisioning_status === "ready" && tenant.is_active;

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
          {status.label}
        </span>
      </div>

      <h3 className="mt-5 text-title-2 text-foreground">{tenant.name}</h3>
      <p className="mt-1 inline-flex items-center gap-1.5 text-caption text-muted-foreground">
        <Globe2 className="size-3.5" />
        {tenant.domain || `${tenant.slug}.contentor.app`}
      </p>

      <div className="mt-5 flex items-center gap-4 text-caption text-muted-foreground">
        <span>
          Plan{" "}
          <span className="font-medium text-foreground">
            {tenant.plan_name ?? "Free"}
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
              Open studio
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="rounded-full" disabled>
            {status.label}
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <a href={tenant.studio_url}>Preview</a>
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
  return (
    <div className="mx-auto max-w-2xl rounded-tile border bg-card p-12 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-muted">
        <Sparkles className="size-7 text-foreground" />
      </div>
      <h2 className="mt-6 text-title-2 text-foreground">
        Launch your first platform
      </h2>
      <p className="mx-auto mt-3 max-w-md text-body text-muted-foreground">
        Create a beautifully designed studio for your courses, live sessions,
        and email campaigns — all under your own brand.
      </p>
      <Button
        asChild
        variant="brand"
        size="lg"
        className="mt-7 gap-2 rounded-full"
      >
        <NavLink href="/signup">
          <Plus className="size-4" />
          New platform
        </NavLink>
      </Button>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  // Superadmins live in /admin — keep this surface coach-only.
  if (user.is_superuser) redirect("/admin");

  const tenants = await getMyTenants();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />

      <section className="px-6 pb-12 pt-20 md:pt-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-eyebrow text-muted-foreground">
              {user.name ? `Hi, ${user.name.split(" ")[0]}` : "Your studio"}
            </p>
            <h1 className="mt-3 text-title text-foreground">Your platforms</h1>
            <p className="mt-4 max-w-xl text-body text-muted-foreground">
              Manage and open each studio you&apos;ve created with Contentor.
              Launch more whenever inspiration strikes.
            </p>
          </div>

          {tenants.length > 0 && (
            <Button
              asChild
              variant="brand"
              size="lg"
              className="gap-2 rounded-full"
            >
              <NavLink href="/signup">
                <Plus className="size-4" />
                New platform
              </NavLink>
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
