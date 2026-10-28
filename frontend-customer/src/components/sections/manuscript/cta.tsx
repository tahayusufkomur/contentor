import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  Arrow,
  BTN,
  DoubleRule,
  Fleuron,
  H2,
  Kicker,
  Section,
  WRAP,
  str,
} from "./ui";
import { useTranslations } from "next-intl";

/** Call-to-action formatted as a formal book invitation / inscription card
 *  with a double hairline frame, Spectral title, fleuron, and subscription button. */
export function CtaSubscribe({ block, editable }: SectionProps) {
  const t = useTranslations("site");
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const card = (
    <div className="manuscript-frame mx-auto max-w-[46rem] bg-background p-8 text-center sm:p-12 md:p-16">
      <Kicker block={block} editable={editable} />

      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder={t("placeholder.heading")}
        className={cn(
          H2,
          "mx-auto mt-4 block max-w-[20ch] text-[clamp(2rem,1.4rem+2.4vw,3.5rem)] font-light leading-[1.08]",
        )}
      />

      <div className="my-5 flex justify-center">
        <Fleuron />
      </div>

      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder={t("placeholder.text")}
        className="mx-auto block max-w-[38ch] text-pretty text-[1.05rem] leading-[1.75] text-muted-foreground md:text-[1.125rem]"
      />

      <DoubleRule className="mx-auto my-8 max-w-[14rem]" />

      {has(block, "ctaLabel", editable) && (
        <div className="mt-2 flex justify-center">
          <SmartLink href={block.ctaHref} className={BTN}>
            <Txt
              block={block}
              field="ctaLabel"
              editable={editable}
              placeholder={t("placeholder.buttonText")}
            />
            <Arrow />
          </SmartLink>
        </div>
      )}
    </div>
  );

  return (
    <Section tone="surface" label={alt || t("manuscript.invitation")}>
      <div className={WRAP}>
        {showImage ? (
          <div className="grid gap-y-12 lg:grid-cols-12 lg:items-center lg:gap-x-12">
            <figure className="lg:col-span-5">
              <div className="manuscript-plate">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[16/10] w-full lg:aspect-[4/5]"
                />
              </div>
            </figure>

            <div className="lg:col-span-7">{card}</div>
          </div>
        ) : (
          card
        )}
      </div>
    </Section>
  );
}
