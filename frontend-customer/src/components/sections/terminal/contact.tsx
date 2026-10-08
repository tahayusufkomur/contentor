import { cn } from "@/lib/utils";
import { ContactForm, Img, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { H2, Kicker, LABEL, Section, WindowChrome, WRAP, str } from "./ui";

/** Contact section styled like filing a new issue on a software issue tracker. */
export function ContactIssue({ block, editable }: SectionProps) {
  const alt = str(block.heading);
  const showImage = Boolean(imageUrl(block.image)) || Boolean(editable);
  const showForm = block.showForm !== false;
  const email = str(block.email);

  const metaRows: { field: string; label: string }[] = [
    { field: "email", label: "assignee_email" },
    { field: "location", label: "headquarters" },
    { field: "hours", label: "sla_response" },
  ].filter((r) => has(block, r.field, editable));

  return (
    <Section tone="console" label={alt || "Contact"}>
      <div className={WRAP}>
        <WindowChrome
          title="~/tracker/issues/new.md"
          tag="[OPEN]"
          bodyClassName="p-6 sm:p-10 md:p-12"
        >
          <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-12">
            {/* Left Column: Issue metadata & description */}
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
                  "mt-4 block max-w-[18ch] text-[clamp(1.85rem,1.35rem+1.8vw,3rem)] leading-[1.08]",
                )}
              />
              <Txt
                block={block}
                field="text"
                editable={editable}
                as="p"
                placeholder="Text"
                className="mt-6 block max-w-[44ch] text-pretty text-[1.05rem] leading-[1.65] text-muted-foreground"
              />

              {showImage && (
                <figure className="mt-8 mb-4 max-w-[14rem]">
                  <WindowChrome
                    title="coach_avatar.raw"
                    tag="ID"
                    bodyClassName="p-0 overflow-hidden"
                  >
                    <Img
                      value={block.image}
                      alt={alt}
                      className="aspect-[4/5] w-full"
                    />
                  </WindowChrome>
                </figure>
              )}

              {metaRows.length > 0 && (
                <dl className="mt-8 border-t border-border font-mono">
                  {metaRows.map((r) => (
                    <div
                      key={r.field}
                      className="grid grid-cols-[10rem_minmax(0,1fr)] items-baseline gap-x-2 border-b border-border/60 py-3 text-xs"
                    >
                      <dt className={cn(LABEL, "text-muted-foreground")}>
                        {r.label}:
                      </dt>
                      <dd className="min-w-0 break-words font-medium text-foreground">
                        {r.field === "email" && email && !editable ? (
                          <a href={`mailto:${email}`} className="terminal-link">
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

            {/* Right Column: Issue submission form */}
            {showForm && (
              <div className="lg:col-span-7">
                <div className="rounded-[var(--radius)] border border-border bg-[color-mix(in_oklch,var(--background)_95%,var(--surface))] p-6 sm:p-8">
                  <div className="mb-6 font-mono text-xs text-primary font-bold">
                    -- NEW ISSUE TEMPLATE
                  </div>
                  <ContactForm
                    className="terminal-form space-y-6"
                    submitLabel="Submit new issue"
                    buttonClassName="terminal-btn-hover h-auto min-h-12 w-full rounded-[var(--radius)] bg-primary px-6 py-3 font-mono text-[0.95rem] font-bold text-primary-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        </WindowChrome>
      </div>
    </Section>
  );
}
