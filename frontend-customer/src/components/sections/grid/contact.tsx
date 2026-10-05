import { cn } from "@/lib/utils";
import { ContactForm, Img, SmartLink, Txt, has, imageUrl } from "../kit";
import type { SectionProps } from "../types";
import { Head, Sheet, row } from "./ui";

/** The email address set as display type, details as a definition list,
 *  the form on the right. */
export function ContactDefinition({ block, editable }: SectionProps) {
  const email = typeof block.email === "string" ? block.email.trim() : "";
  const photo = imageUrl(block.image);
  const showForm = block.showForm !== false;
  const details = [
    { field: "location", label: "Location" },
    { field: "hours", label: "Hours" },
  ].filter((d) => has(block, d.field, editable));

  return (
    <Sheet>
      <Head block={block} editable={editable} intro="text" />

      {(email || editable) && (
        <div className="mt-14 border-t border-foreground pt-3 md:mt-20">
          <p className="swiss-mono text-muted-foreground">Email</p>
          <SmartLink
            href={email && !editable ? `mailto:${email}` : null}
            className="swiss-email mt-4 block decoration-2 underline-offset-[0.12em] hover:text-primary hover:underline md:mt-6"
          >
            <Txt
              block={block}
              field="email"
              editable={editable}
              placeholder="you@example.com"
            />
          </SmartLink>
        </div>
      )}

      <div className={cn(row, "mt-14 gap-y-12 md:mt-20")}>
        {photo && (
          <Img
            value={block.image}
            alt={String(block.heading ?? "")}
            className="swiss-photo col-span-6 aspect-[4/5] md:col-span-3"
          />
        )}
        {details.length > 0 && (
          <dl className="col-span-12 self-start border-b border-foreground md:col-span-4 md:col-start-4">
            {details.map((d) => (
              <div key={d.field} className="border-t border-foreground py-4">
                <dt className="swiss-mono text-muted-foreground">{d.label}</dt>
                <dd className="mt-2 text-[1.0625rem] leading-[1.45]">
                  <Txt
                    block={block}
                    field={d.field}
                    editable={editable}
                    placeholder={d.label}
                  />
                </dd>
              </div>
            ))}
          </dl>
        )}
        {showForm && (
          <div
            className={cn(
              "col-span-12 border-t border-foreground pt-4",
              photo || details.length
                ? "md:col-span-5 md:col-start-8"
                : "md:col-span-6 md:col-start-4",
            )}
          >
            <ContactForm className="swiss-form space-y-7" />
          </div>
        )}
      </div>
    </Sheet>
  );
}
