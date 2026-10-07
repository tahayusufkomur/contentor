import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** The kitchen door: direct contact facts in dotted rows beside an ink-bordered enquiry form. */
export function ContactKitchen({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Email" },
    { field: "location", label: "Kitchen" },
    { field: "hours", label: "Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt}>
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
              "mt-4 block max-w-[18ch] text-[clamp(1.9rem,1.4rem+1.9vw,3.2rem)] leading-[1.06]",
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
            <Img
              value={block.image}
              alt={alt}
              className="tavola-photo mt-10 aspect-[4/5] w-40 rounded-[var(--radius)]"
            />
          )}
          {rows.length > 0 && (
            <dl className="mt-10">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-4 border-b-2 border-dotted border-border py-4"
                >
                  <dt className={LABEL}>{r.label}</dt>
                  <dd className="min-w-0 break-words text-[1.05rem]">
                    {r.field === "email" && email && !editable ? (
                      <a
                        href={`mailto:${email}`}
                        className="tavola-link font-bold"
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
          <div className="lg:col-span-6 lg:col-start-7">
            <ContactForm
              className="tavola-form space-y-7"
              buttonClassName="h-auto min-h-12 w-auto rounded-[var(--radius)] bg-accent px-8 py-3 text-[0.95rem] font-bold text-accent-foreground shadow-none hover:bg-primary"
            />
          </div>
        )}
      </div>
    </Section>
  );
}
