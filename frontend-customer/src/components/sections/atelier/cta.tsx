import { cn } from "@/lib/utils";
import { Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  ARCH,
  ArchFrame,
  Arrow,
  BTN,
  Diamond,
  H2,
  Kicker,
  Section,
  WRAP,
  str,
} from "./ui";

/** Appointment booking call-to-action framed in double champagne hairlines. */
export function CtaAppointment({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);

  const cardContent = (
    <div className="flex flex-col items-center text-center">
      <Kicker block={block} editable={editable} />
      <Txt
        block={block}
        field="heading"
        editable={editable}
        as="h2"
        placeholder="Schedule an appointment"
        className={cn(
          H2,
          "mt-4 block max-w-[20ch] text-[clamp(2.1rem,1.4rem+3vw,4.2rem)] leading-[1.04]",
        )}
      />
      <Txt
        block={block}
        field="text"
        editable={editable}
        as="p"
        placeholder="Choose a time that suits your routine."
        className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.7] text-muted-foreground"
      />

      <div className="mt-8 flex items-center justify-center gap-3">
        <Diamond />
        <Diamond />
        <Diamond />
      </div>

      {has(block, "ctaLabel", editable) && (
        <div className="mt-9">
          <SmartLink href={block.ctaHref} className={BTN}>
            <Txt
              block={block}
              field="ctaLabel"
              editable={editable}
              placeholder="Book appointment"
            />
            <Arrow />
          </SmartLink>
        </div>
      )}
    </div>
  );

  return (
    <Section label={alt || "Appointment"}>
      <div className={WRAP}>
        {showImage ? (
          <div className="mx-auto max-w-5xl rounded-3xl border border-[color-mix(in_oklch,var(--border)_85%,transparent)] p-2 sm:p-3">
            <div className="grid items-center gap-10 rounded-[calc(1.5rem-4px)] border border-[color-mix(in_oklch,var(--border)_85%,transparent)] bg-card p-6 sm:p-10 lg:grid-cols-12 lg:p-12">
              <figure className="lg:col-span-5">
                <ArchFrame className="mx-auto max-w-xs lg:max-w-none">
                  <Img
                    value={block.image}
                    alt={alt}
                    className={cn(ARCH, "aspect-[3/4] w-full")}
                  />
                </ArchFrame>
              </figure>
              <div className="lg:col-span-7">{cardContent}</div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl rounded-3xl border border-[color-mix(in_oklch,var(--border)_85%,transparent)] p-2 sm:p-3">
            <div className="rounded-[calc(1.5rem-4px)] border border-[color-mix(in_oklch,var(--border)_85%,transparent)] bg-card px-6 py-12 sm:px-12 sm:py-16">
              {cardContent}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
