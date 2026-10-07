import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H2, LABEL, RULE, RunningHead, Section, WRAP, str } from "./ui";

/** Contact formatted as letterhead correspondence: running head, small framed
 *  portrait, facts in a ruled ledger, and an ink-ruled form. */
export function ContactLetterhead({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Email" },
    { field: "location", label: "Office" },
    { field: "hours", label: "Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section label={alt}>
      <div className={WRAP}>
        <RunningHead block={block} editable={editable} right="Correspondence" />

        <div className="mt-12 grid gap-y-14 lg:mt-16 lg:grid-cols-12 lg:gap-x-10">
          <div className={showForm ? "lg:col-span-5" : "lg:col-span-7"}>
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              placeholder="Heading"
              className={cn(
                H2,
                "block max-w-[17ch] text-[clamp(2.1rem,1.5rem+2.1vw,3.6rem)] leading-[1.06]",
              )}
            />
            <Txt
              block={block}
              field="text"
              editable={editable}
              as="p"
              placeholder="Text"
              className="mt-6 block max-w-[46ch] text-pretty text-[1.0625rem] leading-[1.65] text-muted-foreground"
            />

            {showImage && (
              <Img
                value={block.image}
                alt={alt}
                className="ledger-frame mt-10 aspect-[4/5] w-40"
              />
            )}
            {rows.length > 0 && (
              <dl className="mt-12 border-b border-border">
                {rows.map((r) => (
                  <div
                    key={r.field}
                    className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-border py-4"
                  >
                    <dt className={cn(LABEL, "ledger-dim")}>{r.label}</dt>
                    <dd className="min-w-0 break-words font-display text-[1.2rem] leading-snug">
                      {r.field === "email" && email && !editable ? (
                        <a href={`mailto:${email}`} className="ledger-link">
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
              <div className={cn(RULE, "pt-10 lg:mt-3")}>
                <ContactForm
                  className="ledger-form space-y-8"
                  buttonClassName="h-auto min-h-12 w-auto rounded-none px-8 py-3 text-[0.95rem] shadow-none hover:bg-accent"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
