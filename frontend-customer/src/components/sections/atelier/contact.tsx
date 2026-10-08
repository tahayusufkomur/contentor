import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { ARCH, ArchFrame, H2, Kicker, LABEL, Section, WRAP, str } from "./ui";

/** Atelier studio contact: studio location and consultation hours with underline inquiry fields. */
export function ContactStudio({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Studio Email" },
    { field: "location", label: "Atelier Address" },
    { field: "hours", label: "Consultation Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt || "Studio Contact"}>
      <div className={cn(WRAP, "grid gap-y-14 lg:grid-cols-12 lg:gap-x-12")}>
        <div className={showForm ? "lg:col-span-5" : "lg:col-span-7"}>
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Studio Inquiries"
            className={cn(
              H2,
              "mt-4 block max-w-[18ch] text-[clamp(1.9rem,1.35rem+2vw,3.4rem)] leading-[1.08]",
            )}
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Reach out to book a private consultation or inquire about tailored programs."
            className="mt-6 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.7] text-muted-foreground"
          />

          {showImage && (
            <figure className="mt-8">
              <ArchFrame className="max-w-[11rem]">
                <Img
                  value={block.image}
                  alt={alt}
                  className={cn(ARCH, "aspect-[3/4] w-full")}
                />
              </ArchFrame>
            </figure>
          )}

          {rows.length > 0 && (
            <dl className="mt-10 divide-y divide-[color-mix(in_oklch,var(--border)_80%,transparent)] border-y border-[color-mix(in_oklch,var(--border)_80%,transparent)]">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-4 py-4"
                >
                  <dt className={cn(LABEL, "text-muted-foreground")}>
                    {r.label}
                  </dt>
                  <dd className="min-w-0 break-words text-[1.02rem] leading-snug">
                    {r.field === "email" && email && !editable ? (
                      <a href={`mailto:${email}`} className="atelier-link">
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
          <div className="rounded-3xl border border-[color-mix(in_oklch,var(--border)_80%,transparent)] bg-card p-6 sm:p-10 lg:col-span-6 lg:col-start-7">
            <ContactForm
              className="atelier-form space-y-8"
              buttonClassName="h-auto min-h-12 w-full sm:w-auto rounded-full bg-primary px-8 py-3 text-[0.92rem] font-medium text-primary-foreground shadow-none transition-all duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-md"
            />
          </div>
        )}
      </div>
    </Section>
  );
}
