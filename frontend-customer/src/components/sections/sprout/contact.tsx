import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  BlobImage,
  H2,
  Kicker,
  PILL,
  Section,
  SproutDoodle,
  SunDoodle,
  WRAP,
  str,
} from "./ui";

/** Friendly contact section with location, response hours, and a pill-rounded inquiry form. */
export function ContactHello({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows = [
    { field: "email", label: "Email" },
    { field: "location", label: "Location" },
    { field: "hours", label: "Hours" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section tone="surface" label={alt || "Contact"}>
      <div className={cn(WRAP, "grid gap-y-12 lg:grid-cols-12 lg:gap-x-12")}>
        {/* Left Column: Heading, Info & Coach Photo */}
        <div
          className={
            showForm ? "lg:col-span-5" : "lg:col-span-8 lg:col-start-3"
          }
        >
          <Kicker block={block} editable={editable} />
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(
              H2,
              "mt-4 block max-w-[18ch] text-[clamp(1.9rem,1.4rem+2vw,3.2rem)] leading-[1.12]",
            )}
          />
          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-4 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
          />

          {showImage && (
            <div className="mt-8 mb-8 max-w-[14rem]">
              <BlobImage
                value={block.image}
                alt={alt}
                variant={2}
                offsetColor="accent"
              />
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-8 space-y-3">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="flex flex-col gap-1 rounded-2xl border border-[color-mix(in_oklch,var(--border)_70%,transparent)] bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <span
                    className={cn(
                      PILL,
                      "bg-[color-mix(in_oklch,var(--accent)_25%,transparent)] text-accent-foreground font-bold w-fit",
                    )}
                  >
                    {r.label}
                  </span>
                  <div className="min-w-0 font-medium text-foreground">
                    {r.field === "email" && email && !editable ? (
                      <a
                        href={`mailto:${email}`}
                        className="font-display font-semibold text-primary transition-colors hover:underline"
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Contact Form Card with Greeting Doodle */}
        {showForm && (
          <div className="lg:col-span-7">
            <div className="relative overflow-hidden rounded-[2.5rem] border border-[color-mix(in_oklch,var(--border)_70%,transparent)] bg-card p-7 shadow-md sm:p-10">
              {/* Corner Greeting Doodle */}
              <div
                aria-hidden="true"
                className="absolute right-6 top-6 text-accent opacity-70 sprout-wiggle"
              >
                <SunDoodle className="size-10" />
              </div>

              <div className="mb-6 flex items-center gap-2">
                <SproutDoodle className="size-5 text-primary" />
                <h3 className="font-display text-[1.3rem] font-bold text-foreground">
                  Send a message
                </h3>
              </div>

              <ContactForm
                className="sprout-form space-y-6"
                buttonClassName="sprout-focus min-h-12 w-full rounded-full bg-primary px-8 py-3.5 font-display text-[1rem] font-bold text-primary-foreground shadow-md transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
