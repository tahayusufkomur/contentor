import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { FRAME, H2, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** The address: the house coordinates set as a letterhead with a hairline contact form. */
export function ContactAddress({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Email" },
    { field: "location", label: "Atelier" },
    { field: "hours", label: "Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt}>
      <div className={cn(WRAP, "grid gap-y-16 lg:grid-cols-12 lg:gap-x-12")}>
        <div className={showForm ? "lg:col-span-5" : "lg:col-span-7"}>
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(
              H2,
              "mt-5 block max-w-[16ch] text-[clamp(1.9rem,1.4rem+1.9vw,3.4rem)] leading-[1.02]",
            )}
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-7 block max-w-[40ch] text-pretty font-light text-[1.02rem] leading-[1.8] text-muted-foreground"
          />

          {showImage && (
            <div className={cn(FRAME, "mt-10 w-40 p-1.5")}>
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[3/4] w-full"
              />
            </div>
          )}
          {rows.length > 0 && (
            <dl className="mt-12 border-t border-foreground">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-4 border-b border-border py-4"
                >
                  <dt className={cn(LABEL, "text-muted-foreground")}>
                    {r.label}
                  </dt>
                  <dd className="min-w-0 break-words font-display text-[1.15rem]">
                    {r.field === "email" && email && !editable ? (
                      <a href={`mailto:${email}`} className="maison-link">
                        {email}
                      </a>
                    ) : (
                      <Txt
                        block={block}
                        field={r.field}
                        editable={editable}
                        placeholder={r.label}
                      />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {showForm && (
          <div className="lg:col-span-6 lg:col-start-7">
            <ContactForm
              className="maison-form space-y-9"
              buttonClassName="h-auto min-h-12 w-auto rounded-none border border-foreground bg-transparent px-8 py-3 text-[0.68rem] font-normal uppercase tracking-[0.28em] text-foreground shadow-none hover:bg-foreground hover:text-background"
            />
          </div>
        )}
      </div>
    </Section>
  );
}
