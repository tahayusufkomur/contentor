import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Office hours and contact details with a ruled inquiry form. */
export function ContactOfficeHours({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Email" },
    { field: "location", label: "Classroom" },
    { field: "hours", label: "Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt || "Contact"}>
      <div className={cn(WRAP, "grid gap-y-14 lg:grid-cols-12 lg:gap-x-10")}>
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
              "mt-4 block max-w-[18ch] text-[clamp(1.9rem,1.4rem+1.9vw,3.2rem)] leading-[1.08]",
            )}
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
          />

          {showImage && (
            <figure className="mb-10">
              <Img
                value={block.image}
                alt={alt}
                className="primer-print aspect-[4/5] w-40 rotate-[-2deg]"
              />
            </figure>
          )}
          {rows.length > 0 && (
            <dl className="mt-10 border-b border-border">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-border py-4"
                >
                  <dt className={cn(LABEL, "text-accent")}>{r.label}</dt>
                  <dd className="min-w-0 break-words text-[1.05rem] leading-snug">
                    {r.field === "email" && email && !editable ? (
                      <a href={`mailto:${email}`} className="primer-link">
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
              className="primer-form space-y-8"
              buttonClassName="h-auto min-h-12 w-auto rounded-[var(--radius)] px-8 py-3 text-[0.95rem] font-bold shadow-none hover:bg-accent"
            />
          </div>
        )}
      </div>
    </Section>
  );
}
