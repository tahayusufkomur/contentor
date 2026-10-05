import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Kicker, PopSection, WRAP, str } from "./ui";

/** A postcard: message side on the left, the photo as a perforated stamp and
 *  the form on the right, split by a dashed fold. */
export function ContactPostcard({ block, editable }: SectionProps) {
  const showForm = block.showForm !== false;
  const withImage = Boolean(imageUrl(block.image));
  const email = str(block.email);
  const details = [
    { field: "email", label: "Email" },
    { field: "location", label: "Where" },
    { field: "hours", label: "When" },
  ].filter((d) => has(block, d.field, editable));
  const twoSides = showForm || withImage;
  return (
    <PopSection bg="var(--card)" className="py-20 md:py-28">
      <div className={WRAP}>
        <div
          className={cn(
            "pop-card relative grid bg-[var(--pop-paper)] [--pop-r:2rem]",
            twoSides && "lg:grid-cols-2",
          )}
        >
          <div className="p-7 sm:p-10 lg:p-14">
            <Kicker block={block} editable={editable} fill="pink" />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className="pop-display mt-6 text-[clamp(2.5rem,1.5rem+3.4vw,4.75rem)]"
              placeholder="Heading"
            />
            <Txt
              block={block}
              field="text"
              editable={editable}
              as="p"
              className="pop-lede mt-6 max-w-[34rem] text-muted-foreground"
            />
            {details.length > 0 && (
              <dl className="mt-10 divide-y-2 divide-dashed divide-[color:var(--pop-ink)] border-y-2 border-dashed border-[color:var(--pop-ink)]">
                {details.map((d) => (
                  <div
                    key={d.field}
                    className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6"
                  >
                    <dt className="pop-mono w-20 shrink-0 text-[0.8125rem] text-muted-foreground">
                      {d.label}
                    </dt>
                    <dd className="min-w-0 break-words text-[1.0625rem] font-medium">
                      {d.field === "email" && email && !editable ? (
                        <a
                          href={`mailto:${email}`}
                          className="underline decoration-[color:var(--primary)] decoration-2 underline-offset-4 hover:text-[color:var(--primary)]"
                        >
                          {email}
                        </a>
                      ) : (
                        <Txt
                          block={block}
                          field={d.field}
                          editable={editable}
                          placeholder={d.label}
                        />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {twoSides && (
            <div className="relative border-t-2 border-dashed border-[color:var(--pop-ink)] p-7 sm:p-10 lg:border-l-2 lg:border-t-0 lg:p-14">
              {withImage && (
                <div
                  className={cn(
                    "pop-wiggle [--pop-tilt:5deg]",
                    showForm
                      ? "absolute -top-6 right-5 w-28 sm:w-36 lg:-top-8 lg:right-10 lg:w-40"
                      : "mx-auto w-full max-w-xs",
                  )}
                  style={{ rotate: "var(--pop-tilt)" }}
                >
                  <div className="pop-stamp bg-[var(--pop-sun)]">
                    <Img
                      value={block.image}
                      alt={str(block.heading)}
                      className="aspect-[4/5] w-full border-2 border-[color:var(--pop-ink)]"
                    />
                  </div>
                </div>
              )}
              {showForm && (
                <ContactForm
                  className={cn(withImage && "mt-24 sm:mt-32 lg:mt-36")}
                  buttonClassName="h-auto min-h-[3.25rem] rounded-full border-2 border-[color:var(--foreground)] text-base font-semibold shadow-[4px_4px_0_var(--foreground)]"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </PopSection>
  );
}
