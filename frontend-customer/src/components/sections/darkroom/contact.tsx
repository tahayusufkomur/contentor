import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Studio hours and contact details with minimalist hairline form inputs. */
export function ContactHours({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Email" },
    { field: "location", label: "Studio" },
    { field: "hours", label: "Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt}>
      <div
        className={cn(
          WRAP,
          "grid gap-y-14 border-t border-foreground pt-4 lg:grid-cols-12 lg:gap-x-10",
        )}
      >
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
              "mt-3 block max-w-[18ch] text-[clamp(1.8rem,1.35rem+1.8vw,3rem)] leading-[1.05]",
            )}
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-6 block max-w-[46ch] text-pretty text-[1rem] leading-[1.65] text-muted-foreground"
          />

          {showImage && (
            <Img
              value={block.image}
              alt={alt}
              className="mt-10 aspect-[4/5] w-40"
            />
          )}
          {rows.length > 0 && (
            <dl className="mt-10 border-b border-border">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-border py-4"
                >
                  <dt className={cn(LABEL, "text-muted-foreground")}>
                    {r.label}
                  </dt>
                  <dd className="min-w-0 break-words text-[1.02rem] leading-snug">
                    {r.field === "email" && email && !editable ? (
                      <a href={`mailto:${email}`} className="darkroom-link">
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
              className="darkroom-form space-y-8"
              buttonClassName="h-auto min-h-12 w-auto rounded-none px-8 py-3 text-[0.9rem] shadow-none hover:bg-accent"
            />
          </div>
        )}
      </div>
    </Section>
  );
}
