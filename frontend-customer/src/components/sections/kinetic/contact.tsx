import { cn } from "@/lib/utils";
import { ContactForm, Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Arrow, DISPLAY, H2, Kicker, LABEL, WRAP } from "./ui";

/** The email address as giant condensed type that is itself the link. */
export function ContactBigmail({ block, editable }: SectionProps) {
  const email = typeof block.email === "string" ? block.email.trim() : "";
  const showForm = block.showForm !== false;
  const withImage = Boolean(imageUrl(block.image));
  const facts = (["location", "hours"] as const).filter((f) =>
    has(block, f, editable),
  );

  return (
    <section className="kinetic-paper py-20 md:py-32">
      <div className={WRAP}>
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Kicker block={block} editable={editable} />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className={cn(DISPLAY, H2, "mt-5 max-w-[16ch]")}
            />
          </div>
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            className="max-w-[46ch] text-lg leading-[1.55] text-muted-foreground lg:col-span-4 lg:col-start-9"
          />
        </div>

        {(email || editable) && (
          <SmartLink
            href={email && !editable ? `mailto:${email}` : ""}
            className="kinetic-focus-out group mt-14 flex items-center justify-between gap-6 border-y-[3px] border-foreground py-6 md:mt-20 md:py-8"
          >
            <Txt
              block={block}
              field="email"
              editable={editable}
              placeholder="you@yourstudio.com"
              className={cn(
                DISPLAY,
                "min-w-0 normal-case [overflow-wrap:anywhere] transition-colors group-hover:text-primary",
                email.length > 28
                  ? "text-[clamp(1.75rem,0.5rem+4.4vw,5.5rem)]"
                  : "text-[clamp(2.1rem,0.5rem+6.4vw,8rem)]",
              )}
            />
            <span className="hidden size-16 shrink-0 place-items-center bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground sm:grid md:size-24">
              <Arrow className="size-7 md:size-9" />
            </span>
          </SmartLink>
        )}

        {facts.length > 0 && (
          <dl
            className={cn(
              "grid border-b-[3px] border-foreground sm:grid-cols-2",
              !(email || editable) && "mt-14 border-t-[3px] md:mt-20",
            )}
          >
            {facts.map((f, i) => (
              <div
                key={f}
                className={cn(
                  "flex flex-col gap-3 py-6 sm:py-8",
                  i > 0 &&
                    "border-t-2 border-foreground sm:border-l-2 sm:border-t-0 sm:pl-8",
                )}
              >
                <dt className={cn(LABEL, "text-primary")}>
                  {f === "location" ? "Location" : "Hours"}
                </dt>
                <dd>
                  <Txt
                    block={block}
                    field={f}
                    editable={editable}
                    className="text-xl font-medium leading-[1.35]"
                  />
                </dd>
              </div>
            ))}
          </dl>
        )}

        {(withImage || showForm) && (
          <div className="mt-14 grid gap-12 md:mt-20 lg:grid-cols-12 lg:gap-8">
            {withImage && (
              <Img
                value={block.image}
                alt={typeof block.heading === "string" ? block.heading : ""}
                className={cn(
                  "kinetic-notch aspect-[4/5] w-full [--kinetic-notch:40px] max-lg:max-w-md",
                  showForm ? "lg:col-span-5" : "lg:col-span-4",
                )}
                imgClassName="grayscale contrast-[1.15]"
              />
            )}
            {showForm && (
              <div
                className={cn(
                  "lg:self-center",
                  withImage ? "lg:col-span-6 lg:col-start-7" : "lg:col-span-8",
                )}
              >
                <ContactForm
                  className="kinetic-form space-y-8"
                  buttonClassName="kinetic-notch kinetic-focus h-14 rounded-none bg-primary font-sans text-[0.8rem] font-extrabold uppercase tracking-[0.06em] text-primary-foreground shadow-none [font-stretch:125%] hover:bg-foreground hover:text-background"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
