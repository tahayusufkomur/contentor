import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { NavLink } from "@/components/ui/nav-link";
import { FOUNDING_PERKS } from "@/lib/landing";
import { cn } from "@/lib/utils";

/** The person behind the team: the founder's note, first person, beside the
 * founding offer. With no reviews yet, a named founder who sets creators up
 * personally is the page's proof. The initial stands in for the founder's
 * photo until one is shot. */
export async function FounderChapter() {
  const t = await getTranslations("marketing.founder");
  const signature = t("signature");
  return (
    <section
      id="founding"
      aria-labelledby="founding-title"
      className="scroll-mt-24 py-16 md:py-24"
    >
      <div className="mx-auto grid max-w-media items-center gap-10 px-6 md:grid-cols-[5fr_6fr] md:gap-16">
        <div>
          <p className="text-eyebrow text-muted-foreground">{t("eyebrow")}</p>
          <h2
            id="founding-title"
            className="mt-3 text-display-2 text-foreground text-balance"
          >
            {t("title")}
          </h2>
          <p className="mt-5 text-body-lg text-muted-foreground">{t("text")}</p>
          <p className="mt-8 flex items-center gap-3 text-body font-medium text-foreground">
            <span
              aria-hidden
              className="grid size-12 place-items-center rounded-full bg-foreground text-lg font-semibold text-background"
            >
              {signature[0]}
            </span>
            {signature}
          </p>
        </div>
        <div className="rounded-tile bg-muted p-8 md:p-10">
          <p className="text-eyebrow text-marketing-accent">
            {t("offer.title")}
          </p>
          <p className="mt-2 text-body text-muted-foreground">
            {t("offer.text")}
          </p>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2">
            {FOUNDING_PERKS.map((key) => (
              <li key={key}>
                <h3 className="text-body font-semibold text-foreground">
                  {t(`offer.perks.${key}.title`)}
                </h3>
                <p className="mt-1.5 text-body text-muted-foreground">
                  {t(`offer.perks.${key}.text`)}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <NavLink
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "rounded-full px-6",
              )}
            >
              {t("offer.cta")}
            </NavLink>
            <p className="text-caption text-muted-foreground">
              {t("offer.note")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
