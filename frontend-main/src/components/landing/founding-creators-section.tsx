import { getTranslations } from "next-intl/server";
import { NavLink } from "@/components/ui/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PERKS = ["concierge", "discount", "featured"] as const;

/** The founding-creators offer as one tile on second paper (spec 5.4 ch. 8):
 * the three perks as text, no icons; the facts (first 20 coaches, 50% off for
 * 12 months) are today's and live in marketing.json. */
export async function FoundingCreatorsSection() {
  const t = await getTranslations("marketing.start.founding");
  return (
    <section aria-labelledby="founding-title" className="mx-auto max-w-media px-6">
      <div className="rounded-tile bg-muted p-8 md:p-14">
        <p className="text-eyebrow text-muted-foreground">{t("eyebrow")}</p>
        <h3 id="founding-title" className="mt-3 text-title text-foreground text-balance">
          {t("title")}
        </h3>
        <p className="mt-4 max-w-[640px] text-body-lg text-muted-foreground">{t("text")}</p>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {PERKS.map((key) => (
            <div key={key}>
              <h4 className="text-body font-semibold text-foreground">{t(`perks.${key}.title`)}</h4>
              <p className="mt-1.5 text-body text-muted-foreground">{t(`perks.${key}.text`)}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <NavLink href="/signup" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
            {t("cta")}
          </NavLink>
          <p className="text-caption text-muted-foreground">{t("note")}</p>
        </div>
      </div>
    </section>
  );
}
