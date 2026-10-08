import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Dojo location, training hours, and inquiry form with hard ruled dividers. */
export function ContactDojoinfo({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "location", label: "Dojo Location" },
    { field: "hours", label: "Training Hours" },
    { field: "email", label: "Inquiries" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt || "Dojo Contact & Location"}>
      <div className={cn(WRAP, "grid gap-y-14 lg:grid-cols-12 lg:gap-x-14")}>
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
              "mt-4 block max-w-[18ch] text-[clamp(1.9rem,1.4rem+2vw,3.3rem)] leading-[1.06]",
            )}
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.68] text-muted-foreground"
          />

          {showImage && (
            <figure className="my-8">
              <div className="dojo-photo border border-border bg-background p-2 max-w-[12rem]">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </div>
            </figure>
          )}

          {rows.length > 0 && (
            <dl className="mt-8 border-b border-border">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-border py-4"
                >
                  <dt className={cn(LABEL, "text-accent")}>{r.label}</dt>
                  <dd className="min-w-0 break-words text-[1rem] leading-snug text-foreground">
                    {r.field === "email" && email && !editable ? (
                      <a href={`mailto:${email}`} className="dojo-link">
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
            <div className="border border-border bg-background p-6 sm:p-10">
              <p className={cn(LABEL, "mb-6 text-foreground")}>
                Direct Message to Sensei
              </p>
              <ContactForm
                className="dojo-form space-y-7"
                buttonClassName="h-auto min-h-12 w-auto rounded-[var(--radius)] bg-primary px-8 py-3 text-[0.9rem] font-bold tracking-[0.04em] text-primary-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
