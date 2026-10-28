import { cn } from "@/lib/utils";
import { Txt, has } from "../kit";
import type { StyleKit } from "../kit-contract";
import type { SectionProps } from "../types";
import { useTranslations } from "next-intl";

/** Width of one character of display type, in em: a generous average, so the
 *  longest word of the line always fits a phone's width. */
const CHAR_EM = 0.7;

/** The statement's font size: a step by length (two words are a poster, a
 *  full line stays readable), capped so its longest word fits the screen. */
export function statementSize(statement: string): string {
  const step =
    statement.length <= 24
      ? "clamp(3.5rem, 1rem + 10vw, 11rem)"
      : statement.length <= 40
        ? "clamp(3rem, 1rem + 7vw, 8rem)"
        : "clamp(2.4rem, 1rem + 5vw, 6rem)";
  const longest = Math.max(1, ...statement.split(/\s+/).map((w) => w.length));
  return `min(${step}, calc((100vw - 3rem) / ${(longest * CHAR_EM).toFixed(2)}))`;
}

/** One line she believes, set huge on the style's flooded band: the page's
 *  peak. Written only from her own belief (the composer's GIVEN_FAMILIES). */
export function StatementNeutral({
  block,
  editable,
  kit,
}: SectionProps & { kit: StyleKit }) {
  const t = useTranslations("site");
  const statement = typeof block.statement === "string" ? block.statement : "";
  if (!statement && !editable) return null;
  return (
    <kit.Section tone="inverse">
      <div className={kit.wrap}>
        <div style={{ fontSize: statementSize(statement || "One line") }}>
          <Txt
            block={block}
            field="statement"
            editable={editable}
            as="p"
            placeholder={t("placeholder.statementLine")}
            // `!`: some kits set their display size and caps in CSS classes
            // (grid's swiss-h1, pop's pop-h1, studiofloor's uppercase face).
            className={cn(
              kit.display,
              "block max-w-[18ch] !text-[1em] text-balance ![line-height:1.05] [overflow-wrap:break-word]",
              statement.length > 24 && "!normal-case ![line-height:1.32]",
            )}
          />
        </div>
        {has(block, "attribution", editable) && (
          <Txt
            block={block}
            field="attribution"
            editable={editable}
            as="p"
            placeholder={t("placeholder.yourName")}
            // The band's own ink: some kits colour their label voice, too faint on the inverse band.
            className={cn(
              kit.label,
              "mt-10 block !text-current",
              String(block.attribution ?? "").length > 24 && "!normal-case",
            )}
          />
        )}
      </div>
    </kit.Section>
  );
}
