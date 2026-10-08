import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, LABEL_ACCENT, Section, WRAP, str } from "./ui";

/** Studio booking and inquiry: coach details and studio location on the left,
 *  neon underline booking form on the right. */
export function ContactBooking({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Direct Email" },
    { field: "location", label: "Studio Location" },
    { field: "hours", label: "Session Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt || "Contact"}>
      <div className={cn(WRAP, "grid gap-y-14 lg:grid-cols-12 lg:gap-x-12")}>
        <div className={showForm ? "lg:col-span-5" : "lg:col-span-7"}>
          <Kicker block={block} editable={editable} cue="BOOKING" />

          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(
              H2,
              "mt-4 block max-w-[20ch] text-[clamp(1.9rem,1.4rem+2vw,3.4rem)] leading-[0.96]",
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
            <div className="relative my-8 max-w-[12rem] overflow-hidden rounded-[var(--radius)] border border-primary/40 shadow-[0_0_20px_color-mix(in_oklch,var(--primary)_20%,transparent)]">
              <Img
                value={block.image}
                alt={alt}
                className="aspect-[4/5] w-full"
              />
              <div
                aria-hidden="true"
                className="studiofloor-lightbar absolute inset-0 pointer-events-none"
              />
            </div>
          )}

          {rows.length > 0 && (
            <dl className="mt-8 border-b border-border/80">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-border/80 py-4.5"
                >
                  <dt className={LABEL_ACCENT}>{r.label}</dt>
                  <dd className="min-w-0 break-words text-[1.02rem]">
                    {r.field === "email" && email && !editable ? (
                      <a
                        href={`mailto:${email}`}
                        className="studiofloor-link font-medium"
                      >
                        {email}
                      </a>
                    ) : (
                      <Txt
                        block={block}
                        field={r.field}
                        editable={editable}
                        placeholder={r.label}
                        className="font-medium"
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
            <div className="studiofloor-card rounded-[var(--radius)] p-8 md:p-10">
              <div className="mb-6 flex items-center justify-between border-b border-border/80 pb-4">
                <span className="studiofloor-display text-xs font-bold uppercase tracking-widest text-primary">
                  SESSION INQUIRY
                </span>
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
                />
              </div>
              <ContactForm
                className="studiofloor-form space-y-7"
                buttonClassName="studiofloor-focus studiofloor-glow-btn h-auto min-h-12 w-full rounded-[var(--radius)] bg-primary px-8 py-3.5 studiofloor-display text-[1rem] font-extrabold italic text-primary-foreground shadow-[0_0_24px_color-mix(in_oklch,var(--primary)_40%,transparent)] hover:shadow-[0_0_36px_color-mix(in_oklch,var(--primary)_60%,transparent)]"
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
