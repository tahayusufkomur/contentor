import { cn } from "@/lib/utils";
import { EmptyHint, Txt, has, itemsOf } from "../kit";
import type { StyleKit } from "../kit-contract";
import type { SectionProps } from "../types";
import { useTranslations } from "next-intl";

type Quote = { quote?: string; name?: string };
type Figure = { value?: string; label?: string };
type Press = { name?: string };

const filled = (v?: string) => Boolean(v?.trim());

/** Her clients' words, the numbers she states and the press she names: only
 *  what she gave (R10), and nothing at all on the public site when that is
 *  nothing. A quote without a name stands alone, never under an invented one. */
export function ProofNeutral({
  block,
  editable,
  kit,
}: SectionProps & { kit: StyleKit }) {
  const t = useTranslations("site");
  const quotes = itemsOf<Quote>(block, "quotes").filter((q) => filled(q.quote));
  const numbers = itemsOf<Figure>(block, "numbers").filter(
    (n) => filled(n.value) && filled(n.label),
  );
  const press = itemsOf<Press>(block, "press").filter((p) => filled(p.name));
  const empty = !quotes.length && !numbers.length && !press.length;
  if (empty && !editable) return null;

  return (
    <kit.Section tone="surface">
      <div className={cn(kit.wrap, "[&>*:first-child]:mt-0")}>
        {has(block, "heading", editable) && (
          <Txt
            block={block}
            field="heading"
            editable={editable}
            as="h2"
            placeholder={t("placeholder.heading")}
            className={cn(kit.h2, "block max-w-[22ch]")}
          />
        )}
        {empty && (
          <div className="mt-10">
            <EmptyHint
              editable={editable}
              title={t("neutral.proofEmptyTitle")}
              text={t("neutral.proofEmptyText")}
            />
          </div>
        )}
        {numbers.length > 0 && (
          <dl className="mt-12 grid gap-10 sm:grid-cols-3">
            {numbers.map((n, i) => (
              <div key={i} className="flex flex-col-reverse gap-2">
                <dt className="text-base text-muted-foreground">{n.label}</dt>
                <dd
                  className={cn(
                    kit.display,
                    kit.num,
                    "!text-[clamp(2.75rem,1.5rem+3vw,4.5rem)] ![line-height:1]",
                  )}
                >
                  {n.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {quotes.length > 0 && (
          <div
            className={cn(
              "mt-14 grid gap-12",
              quotes.length > 1 && "md:grid-cols-2",
              quotes.length > 2 && "lg:grid-cols-3",
            )}
          >
            {quotes.map((q, i) => (
              <figure key={i} className="max-w-[46ch]">
                <blockquote className="text-pretty text-xl/relaxed">
                  “{q.quote?.trim()}”
                </blockquote>
                {filled(q.name) && (
                  <figcaption
                    className={cn(
                      kit.label,
                      "mt-5 block text-muted-foreground",
                      (q.name?.length ?? 0) > 24 && "!normal-case",
                    )}
                  >
                    {q.name}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
        {press.length > 0 && (
          <div className="mt-14 flex flex-wrap items-baseline gap-x-8 gap-y-3">
            <p className={cn(kit.label, "text-muted-foreground")}>
              {t("neutral.inThePress")}
            </p>
            <ul className="contents">
              {press.map((p, i) => (
                <li key={i} className="text-lg font-medium">
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </kit.Section>
  );
}
