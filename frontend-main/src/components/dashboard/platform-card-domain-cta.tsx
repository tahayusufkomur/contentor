import { Globe2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LocaleNavLink } from "@/i18n/navigation";

export function PlatformCardDomainCta({ slug }: { slug: string }) {
  const t = useTranslations("dashboard");
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <LocaleNavLink href={`/dashboard/domain/${slug}`}>
        <Globe2 className="h-3.5 w-3.5" /> {t("customDomain")}
      </LocaleNavLink>
    </Button>
  );
}
