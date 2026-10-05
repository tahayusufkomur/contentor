import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Cta, Guides, btn, row, textLink } from "./ui";

/** Home hero: a giant statement whose first line starts on the column-4 axis,
 *  over the visible grid; photos are grid-locked tiles underneath. */
export function HeroStatement({ block, editable }: SectionProps) {
  const alt = String(block.headline ?? "");
  const detail = imageUrl(block.image2);
  return (
    <section className="swiss-sec swiss-hero relative overflow-hidden bg-background px-5 pb-16 pt-6 text-foreground md:px-8 md:pb-24 md:pt-8">
      <Guides />
      <div className="relative mx-auto max-w-[88rem]">
        <div className="swiss-rule" />
        <div className={cn(row, "gap-y-1 pt-3")}>
          <Txt
            block={block}
            field="kicker"
            editable={editable}
            as="p"
            placeholder="Label"
            className="swiss-mono col-span-12 md:col-span-3"
          />
          <Txt
            block={block}
            field="meta"
            editable={editable}
            as="p"
            placeholder="Small line"
            className="swiss-mono col-span-12 text-muted-foreground md:col-span-5 md:col-start-4"
          />
        </div>

        {/* A cobalt plumb line drops from the meta line onto the column-4
            axis, exactly where the indented headline begins. */}
        <div aria-hidden="true" className="swiss-plumb mt-4 h-10 md:h-20" />
        <Txt
          block={block}
          field="headline"
          editable={editable}
          as="h1"
          placeholder="Headline"
          className="swiss-h1 swiss-indent mt-2 block"
        />

        <div className={cn(row, "mt-12 gap-y-10 md:mt-20")}>
          {(detail || editable) && (
            <Img
              value={block.image2}
              alt={alt}
              className="swiss-photo hidden aspect-square lg:col-span-3 lg:block"
            />
          )}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 lg:col-start-4">
            {has(block, "subhead", editable) && (
              <Txt
                block={block}
                field="subhead"
                editable={editable}
                as="p"
                placeholder="Subheadline"
                className="swiss-lead block max-w-[34ch]"
              />
            )}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Cta block={block} editable={editable} className={btn.primary} />
              <Cta
                block={block}
                editable={editable}
                label="secondaryLabel"
                href="secondaryHref"
                className={textLink}
              />
            </div>
          </div>
          <Img
            value={block.image}
            alt={alt}
            priority
            className="swiss-photo col-span-12 aspect-[4/5] md:col-span-6 md:col-start-7 lg:col-span-4 lg:col-start-9"
          />
        </div>
      </div>
    </section>
  );
}

/** Inner-page title band: label, headline on the axis, optional square tile. */
export function HeroIntro({ block, editable }: SectionProps) {
  const photo = imageUrl(block.image);
  return (
    <section className="swiss-sec swiss-hero relative overflow-hidden bg-background px-5 pb-14 pt-6 text-foreground md:px-8 md:pb-20 md:pt-8">
      <Guides />
      <div className="relative mx-auto max-w-[88rem]">
        <div className="swiss-rule" />
        <div className={cn(row, "gap-y-6 pt-3")}>
          <Txt
            block={block}
            field="kicker"
            editable={editable}
            as="p"
            placeholder="Label"
            className="swiss-mono col-span-12 md:col-span-3"
          />
          <div
            className={cn(
              "col-span-12 md:col-start-4 md:pt-16",
              photo
                ? "md:col-span-5 lg:col-span-6 lg:col-start-4"
                : "md:col-span-9",
            )}
          >
            <Txt
              block={block}
              field="headline"
              editable={editable}
              as="h1"
              placeholder="Page title"
              className="swiss-h1-intro block"
            />
            {has(block, "subhead", editable) && (
              <Txt
                block={block}
                field="subhead"
                editable={editable}
                as="p"
                placeholder="Subheadline"
                className="swiss-lead mt-6 block max-w-[42ch] text-muted-foreground md:mt-8"
              />
            )}
            {block.ctaLabel ? (
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Cta
                  block={block}
                  editable={editable}
                  className={btn.primary}
                />
                <Cta
                  block={block}
                  editable={editable}
                  label="secondaryLabel"
                  href="secondaryHref"
                  className={textLink}
                />
              </div>
            ) : null}
          </div>
          {photo && (
            <Img
              value={block.image}
              alt={String(block.headline ?? "")}
              priority
              className="swiss-photo col-span-12 aspect-square md:col-span-4 md:col-start-9 lg:col-span-3 lg:col-start-10"
            />
          )}
        </div>
      </div>
    </section>
  );
}
