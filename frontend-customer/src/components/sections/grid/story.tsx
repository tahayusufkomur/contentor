import { cn } from "@/lib/utils";
import { Img, Rich, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Cta, Label, Sheet, row, textLink } from "./ui";

/** Coach story: sticky label, book-set paragraphs on the axis, portrait
 *  locked to the right four columns, setting photo hanging bottom-left. */
export function StoryColumns({ block, editable }: SectionProps) {
  const alt = String(block.heading ?? "");
  const setting = imageUrl(block.image2);
  return (
    <Sheet>
      <div className={cn(row, "gap-y-6 pt-3")}>
        <Label block={block} editable={editable} />
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className="swiss-h2 col-span-12 block md:col-span-9 md:col-start-4"
        />
      </div>

      <div className={cn(row, "mt-12 gap-y-10 md:mt-20")}>
        {(setting || editable) && (
          <Img
            value={block.image2}
            alt={alt}
            className="swiss-photo order-3 col-span-8 aspect-[3/2] md:order-none md:col-span-3 md:self-end"
          />
        )}
        <div className="order-2 col-span-12 md:order-none md:col-span-5 md:col-start-4 lg:col-span-4 lg:col-start-4">
          <Rich
            block={block}
            field="body"
            editable={editable}
            className="swiss-prose text-[1.0625rem] leading-[1.6]"
          />
          {has(block, "signature", editable) && (
            <div className="mt-10 border-t border-foreground pt-3">
              <Txt
                block={block}
                field="signature"
                editable={editable}
                as="p"
                placeholder="Your name"
                className="swiss-h3 block"
              />
            </div>
          )}
          <div className="mt-8">
            <Cta block={block} editable={editable} className={textLink} />
          </div>
        </div>
        <Img
          value={block.image}
          alt={alt}
          className="swiss-photo order-1 col-span-12 aspect-[4/5] md:order-none md:col-span-4 md:col-start-9 lg:col-start-9"
        />
      </div>
    </Sheet>
  );
}

/** Story as an essay: no photo; the label and the heading on the axis, one
 *  book-set column of the coach's words under them, signed under a rule. */
export function StoryEssay({ block, editable }: SectionProps) {
  return (
    <Sheet>
      <div className={cn(row, "gap-y-6 pt-3")}>
        <Label block={block} editable={editable} />
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className="swiss-h2 col-span-12 block md:col-span-9 md:col-start-4"
        />
      </div>
      <div className={cn(row, "mt-12 md:mt-20")}>
        <div className="col-span-12 md:col-span-6 md:col-start-4 lg:col-span-5 lg:col-start-4">
          <Rich
            block={block}
            field="body"
            editable={editable}
            className="swiss-prose text-[1.0625rem] leading-[1.6]"
          />
          {has(block, "signature", editable) && (
            <div className="mt-10 border-t border-foreground pt-3">
              <Txt
                block={block}
                field="signature"
                editable={editable}
                as="p"
                placeholder="Your name"
                className="swiss-h3 block"
              />
            </div>
          )}
          <div className="mt-8">
            <Cta block={block} editable={editable} className={textLink} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
