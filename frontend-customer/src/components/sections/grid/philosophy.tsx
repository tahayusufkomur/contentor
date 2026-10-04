import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Label, Sheet, row } from "./ui";

/** One large paragraph set across eleven columns, first line on the axis;
 *  attribution and an optional wide photo hang underneath. */
export function PhilosophyParagraph({ block, editable }: SectionProps) {
  const photo = imageUrl(block.image);
  return (
    <Sheet tone="ink">
      <figure>
        <div className={cn(row, "pt-3")}>
          <Label block={block} editable={editable} />
        </div>
        <div className={cn(row, "mt-10 md:mt-16")}>
          <blockquote className="col-span-12 md:col-span-11">
            <Txt
              block={block}
              field="statement"
              editable={editable}
              as="p"
              placeholder="Statement"
              className="swiss-statement swiss-indent block md:[--swiss-cols:11]"
            />
          </blockquote>
        </div>
        <div className={cn(row, "mt-12 gap-y-8 md:mt-20")}>
          {has(block, "attribution", editable) && (
            <figcaption className="col-span-12 md:col-span-3 md:col-start-4">
              <span className="block h-px w-10 bg-current" aria-hidden="true" />
              <Txt
                block={block}
                field="attribution"
                editable={editable}
                as="span"
                placeholder="Your name"
                className="swiss-mono mt-3 block"
              />
            </figcaption>
          )}
          {photo && (
            <Img
              value={block.image}
              alt={String(block.attribution ?? block.kicker ?? "")}
              className="swiss-photo col-span-12 aspect-video md:col-span-6 md:col-start-7"
            />
          )}
        </div>
      </figure>
    </Sheet>
  );
}
