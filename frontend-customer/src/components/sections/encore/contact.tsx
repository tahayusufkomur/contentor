import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { BOX, H2, Kicker, LABEL, RULE, Section, WRAP, str } from "./ui";

/** Contact booking: direct contact details and booking form with 3px ink rules and mono field headers. */
export function ContactBooking({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Email" },
    { field: "location", label: "Venue" },
    { field: "hours", label: "Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt}>
      <div className={cn(WRAP, RULE, "pt-5")}>
        <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-10">
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
                "mt-4 block max-w-[14ch] text-[clamp(1.8rem,1.3rem+2vw,3.2rem)] leading-[0.98]",
              )}
            />
            <Txt
              block={block}
              field="text"
              editable={editable}
              as="p"
              placeholder="Text"
              className="mt-6 block max-w-[46ch] text-pretty text-[1.02rem] leading-[1.6] text-muted-foreground"
            />

            {showImage && (
              <div className={cn(BOX, "mt-10 w-40 p-1.5")}>
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </div>
            )}
            {rows.length > 0 && (
              <dl className="mt-10 border-t-[3px] border-foreground">
                {rows.map((r) => (
                  <div
                    key={r.field}
                    className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-4 border-b border-foreground py-4"
                  >
                    <dt className={cn(LABEL, "text-muted-foreground")}>
                      {r.label}
                    </dt>
                    <dd className="min-w-0 break-words text-[1.05rem] font-semibold">
                      {r.field === "email" && email && !editable ? (
                        <a href={`mailto:${email}`} className="encore-link">
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
                className="encore-form space-y-8"
                buttonClassName="h-auto min-h-12 w-auto rounded-none px-8 py-3 font-display text-[0.78rem] font-bold uppercase tracking-[0.04em] shadow-none hover:bg-accent hover:text-accent-foreground"
              />
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
