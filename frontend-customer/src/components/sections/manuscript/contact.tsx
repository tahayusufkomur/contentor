import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { DoubleRule, Fleuron, H2, Kicker, Section, WRAP, str } from "./ui";

/** Correspondence contact page styled as a formal letter to the reader
 *  with epistolary postscript and stationery dispatch form. */
export function ContactLetter({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Email" },
    { field: "location", label: "Desk / Study" },
    { field: "hours", label: "Response" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section tone="paper" label={alt || "Correspondence"}>
      <div className={WRAP}>
        <div className="manuscript-frame mx-auto max-w-[50rem] bg-background p-7 sm:p-12 md:p-16">
          {/* Letterhead */}
          <Kicker block={block} editable={editable} />

          <p className="mt-6 font-display text-[1.4rem] italic text-accent">
            Dear Reader,
          </p>

          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(
              H2,
              "mt-3 block text-[clamp(1.8rem,1.4rem+1.8vw,3rem)] leading-[1.12]",
            )}
          />

          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-5 block text-pretty text-[1.05rem] leading-[1.8] text-muted-foreground"
          />

          {/* Optional Portrait Stamp */}
          {showImage && (
            <figure className="my-8 flex items-center gap-4">
              <div className="manuscript-plate w-28 shrink-0 sm:w-32">
                <Img
                  value={block.image}
                  alt={alt}
                  className="aspect-[4/5] w-full"
                />
              </div>
            </figure>
          )}

          {/* Postscript Details */}
          {rows.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <p className="manuscript-small-caps mb-3 text-xs font-semibold text-accent">
                P.S. — Particulars
              </p>
              <dl className="space-y-2.5">
                {rows.map((r) => (
                  <div
                    key={r.field}
                    className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-4 text-[0.95rem]"
                  >
                    <dt className="manuscript-small-caps text-muted-foreground">
                      {r.label}:
                    </dt>
                    <dd className="min-w-0 break-words text-foreground">
                      {r.field === "email" && email && !editable ? (
                        <a href={`mailto:${email}`} className="manuscript-link">
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
            </div>
          )}

          <DoubleRule className="my-8" />

          {/* Letter Reply Form */}
          {showForm && (
            <div className="mt-8">
              <p className="manuscript-small-caps mb-4 text-xs font-semibold text-accent">
                Reply by Letter
              </p>
              <ContactForm
                className="manuscript-form space-y-6"
                buttonClassName="h-auto min-h-12 w-auto rounded-[var(--radius)] bg-primary px-8 py-3 text-[0.92rem] font-medium text-primary-foreground shadow-none transition-colors duration-300 hover:bg-accent hover:text-accent-foreground"
              />
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <Fleuron />
          </div>
        </div>
      </div>
    </Section>
  );
}
