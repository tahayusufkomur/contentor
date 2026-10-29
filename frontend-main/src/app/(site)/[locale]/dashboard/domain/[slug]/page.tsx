import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthUser } from "@/lib/auth";
import { localizedHref } from "@/lib/locale-href";
import { getMyTenants } from "@/lib/tenants";
import { DomainWizard } from "./wizard";

export default async function DomainWizardPage({
  params,
}: {
  params: { slug: string };
}) {
  const user = await getAuthUser();
  if (!user) redirect(localizedHref("/login", await getLocale()));
  const tenants = await getMyTenants();
  const tenant = tenants.find((x) => x.slug === params.slug);
  if (!tenant) notFound();
  const t = await getTranslations("domain.page");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.rich("forSite", {
          name: (chunks) => (
            <span className="font-medium text-foreground">{chunks}</span>
          ),
          domain: tenant.domain,
        })}
      </p>
      <div className="mt-8">
        <DomainWizard
          slug={tenant.slug}
          host={tenant.domain}
          defaultEmail={user.email ?? ""}
          defaultName={user.name ?? ""}
        />
      </div>
    </main>
  );
}
