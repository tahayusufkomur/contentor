import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import {
  GoldFrame,
  H2,
  Kicker,
  LABEL,
  MoonPhases,
  Section,
  StarGlyph,
  WRAP,
  str,
} from "./ui";

/** Contact "message": Send a celestial inquiry in an ornate gold frame. */
export function ContactMessage({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const rows: { field: string; label: string }[] = [
    { field: "email", label: "Celestial dispatch" },
    { field: "location", label: "Sanctuary altar" },
    { field: "hours", label: "Hours of alignment" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section tone="surface" label={alt || "Contact"}>
      <div className={cn(WRAP, "grid gap-y-14 lg:grid-cols-12 lg:gap-x-12")}>
        <div
          className={
            showForm
              ? "lg:col-span-5"
              : "mx-auto max-w-2xl text-center lg:col-span-12"
          }
        >
          <Kicker block={block} editable={editable} />
          <MoonPhases
            className={cn(
              "mt-3.5",
              showForm ? "justify-start" : "justify-center",
            )}
          />

          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder="Heading"
            className={cn(
              H2,
              "mt-4 block max-w-[18ch] text-[clamp(1.9rem,1.4rem+1.8vw,3.2rem)]",
            )}
          />

          <Txt
            block={block}
            field="text"
            editable={editable}
            as="p"
            placeholder="Text"
            className="mt-6 block max-w-[46ch] text-pretty text-[1.05rem] leading-[1.7] text-muted-foreground"
          />

          {showImage && (
            <figure className="my-8">
              <Img
                value={block.image}
                alt={alt}
                className="sanctum-arch aspect-[4/5] w-44 border border-[color-mix(in_oklch,var(--primary)_50%,transparent)] p-1 shadow-lg"
              />
            </figure>
          )}

          {rows.length > 0 && (
            <dl className="mt-10 border-b border-[color-mix(in_oklch,var(--primary)_20%,transparent)]">
              {rows.map((r) => (
                <div
                  key={r.field}
                  className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-[color-mix(in_oklch,var(--primary)_20%,transparent)] py-4 text-left"
                >
                  <dt className={cn(LABEL, "flex items-center gap-1.5")}>
                    <StarGlyph className="size-2 text-primary" />
                    <span>{r.label}</span>
                  </dt>
                  <dd className="min-w-0 break-words text-[1.02rem] leading-snug">
                    {r.field === "email" && email && !editable ? (
                      <a href={`mailto:${email}`} className="sanctum-link">
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
          <div className="lg:col-span-7">
            <GoldFrame className="sanctum-form shadow-2xl">
              <div className="mb-6 flex items-center justify-between border-b border-[color-mix(in_oklch,var(--primary)_20%,transparent)] pb-4">
                <span className="font-display text-[0.85rem] uppercase tracking-[0.16em] text-primary">
                  Inquiry of the Stars
                </span>
                <StarGlyph className="size-3.5" />
              </div>

              <ContactForm
                className="space-y-6"
                buttonClassName="sanctum-focus h-auto min-h-12 w-full rounded-[var(--radius)] bg-primary px-8 py-3.5 font-display text-[0.82rem] font-medium uppercase tracking-[0.14em] text-primary-foreground shadow-none transition-transform duration-300 motion-safe:hover:-translate-y-0.5 hover:bg-[color-mix(in_oklch,var(--primary)_85%,var(--foreground))]"
              />
            </GoldFrame>
          </div>
        )}
      </div>
    </Section>
  );
}
