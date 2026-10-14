import { getTranslations } from "next-intl/server";
import { Chapter } from "@/components/motion/chapter";
import { Reveal } from "@/components/motion/reveal";
import { MONEY_TILES } from "@/lib/landing";

/** Chapter 7 (spec 5.4), the second cinematic chapter: "Then the money
 * follows." Three flat tiles on the dark second paper: Stripe and
 * memberships, payouts, her brand alone on the receipt. Text only, short, no
 * invented numbers (landing-copy.test.ts forbids digits here). */
export async function MoneyChapter() {
  const t = await getTranslations("marketing.money");
  return (
    <Chapter id="money" dark eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")}>
      <Reveal stagger className="mx-auto grid max-w-media gap-5 px-6 md:grid-cols-3">
        {MONEY_TILES.map((key) => (
          <div key={key} className="rounded-tile bg-muted p-8">
            <h3 className="text-title-2 text-foreground">{t(`tiles.${key}.title`)}</h3>
            <p className="mt-3 text-body text-muted-foreground">{t(`tiles.${key}.text`)}</p>
          </div>
        ))}
      </Reveal>
    </Chapter>
  );
}
