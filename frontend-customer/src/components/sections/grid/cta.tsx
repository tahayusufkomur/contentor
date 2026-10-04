import { cn } from "@/lib/utils";
import { Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Cta, Label, Sheet, btn, row } from "./ui";

/** The one colour block: a cobalt sheet over the visible grid, a huge line,
 *  and the photo (if any) printed as a cobalt duotone. */
export function CtaBlock({ block, editable }: SectionProps) {
  const photo = imageUrl(block.image);
  return (
    <Sheet tone="cobalt" guides>
      <div className={cn(row, "pt-3")}>
        <Label block={block} editable={editable} className="opacity-85" />
      </div>
      <div className={cn(row, "mt-12 md:mt-20")}>
        <Txt
          block={block}
          field="heading"
          editable={editable}
          as="h2"
          placeholder="Heading"
          className="swiss-h1 swiss-indent col-span-12 block md:col-span-11 md:[--swiss-cols:11]"
        />
      </div>
      <div className={cn(row, "mt-12 gap-y-10 md:mt-20")}>
        <div className="col-span-12 md:col-span-5 md:col-start-4 lg:col-span-4 lg:col-start-4">
          {has(block, "text", editable) && (
            <Txt
              block={block}
              field="text"
              editable={editable}
              as="p"
              placeholder="Text"
              className="swiss-lead block max-w-[36ch]"
            />
          )}
          <div className="mt-8">
            <Cta block={block} editable={editable} className={btn.onCobalt} />
          </div>
        </div>
        {photo && (
          <Img
            value={block.image}
            alt={String(block.heading ?? "")}
            className="swiss-duo col-span-12 aspect-video md:col-span-4 md:col-start-9 md:self-end"
          />
        )}
      </div>
    </Sheet>
  );
}
