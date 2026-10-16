import { getTranslations } from "next-intl/server";
import { NavLink } from "@/components/ui/nav-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The close (spec 5.4 ch. 8): one tile of second paper, display-2 line, the
 * pill, the no-card note. */
export async function FinalCtaSection() {
  const t = await getTranslations("marketing.start.cta");
  return (
    <section className="mx-auto mt-16 max-w-media px-6">
      <div className="rounded-tile bg-muted px-8 py-12 text-center md:py-16">
        <h2 className="text-display-2 text-foreground text-balance">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-[560px] text-body-lg text-muted-foreground">
          {t("text")}
        </p>
        <NavLink
          href="/signup"
          className={cn(
            buttonVariants({ size: "lg" }),
            "mt-8 rounded-full px-7",
          )}
        >
          {t("button")}
        </NavLink>
        <p className="mt-4 text-caption text-muted-foreground">{t("note")}</p>
      </div>
    </section>
  );
}
