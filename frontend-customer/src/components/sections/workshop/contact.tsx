import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, Polaroid, Section, WRAP, str } from "./ui";

/** Studio visit card (location, hours, email) and workshop inquiry slip. */
export function ContactVisit({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Email" },
    { field: "location", label: "Studio Bench" },
    { field: "hours", label: "Studio Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section tone="kraft" label={alt || "Contact"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-12")}>
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
              "mt-3 block max-w-[18ch] text-[clamp(1.9rem,1.4rem+1.9vw,3.2rem)] leading-[1.08]",
            )}
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-5 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
          />

          {showImage && (
            <div className="mt-8 mb-4 max-w-[12rem]">
              <Polaroid
                image={block.image}
                alt={alt}
                className="aspect-[4/5] w-full rotate-[-2deg]"
                tapePosition="top-left"
              />
            </div>
          )}

          {rows.length > 0 && (
            <dl className="mt-8 space-y-3">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="rounded-[var(--radius)] border border-dashed border-border bg-card p-4 sm:flex sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <dt className="workshop-hand text-[1.15rem] font-bold text-accent sm:w-32 sm:shrink-0">
                    {r.label}
                  </dt>
                  <dd className="mt-1 min-w-0 break-words text-[1rem] leading-snug sm:mt-0 sm:text-right">
                    {r.field === "email" && email && !editable ? (
                      <a
                        href={`mailto:${email}`}
                        className="workshop-link font-medium"
                      >
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
          <div className="lg:col-span-7">
            <div className="workshop-seam rounded-[var(--radius)] border-2 border-dashed border-border bg-card p-6 sm:p-8 md:p-10 shadow-xs">
              <div className="mb-6 flex items-center justify-between border-b border-dashed border-border pb-3">
                <span className="workshop-hand text-[1.25rem] font-bold text-accent">
                  Studio Inquiry Slip
                </span>
              </div>
              <ContactForm
                className="workshop-form space-y-6"
                buttonClassName="workshop-focus inline-flex h-auto min-h-12 w-auto items-center justify-center rounded-[var(--radius)] bg-primary px-8 py-3 text-[1rem] font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:shadow-md border border-dashed border-[color-mix(in_oklch,var(--primary-foreground)_40%,transparent)]"
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
