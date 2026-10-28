import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { InlineText } from "./inline-text";
import { EditableBody } from "./editable-body";
import { headingClasses } from "@/lib/blocks/style";
import type { BlockComponentProps } from "@/lib/blocks/types";

export function RichTextBlock({ data, editable }: BlockComponentProps) {
  const t = useTranslations("site");
  if (!editable && !data.heading && !data.body) return null;
  const level = data.headingLevel || "h2";
  const layout = data.layout || "standard";
  const width = layout === "wide" ? "max-w-5xl" : "max-w-3xl";
  const centered = layout === "centered";
  return (
    <section className="py-16">
      <div className={cn("mx-auto px-4", width, centered && "text-center")}>
        {(data.heading || editable) && (
          <InlineText
            as={level}
            className={headingClasses(level)}
            value={data.heading}
            field="heading"
            editable={editable}
            placeholder={t("placeholder.heading")}
          />
        )}
        {(data.body || editable) && (
          <EditableBody
            className="mt-4 leading-relaxed text-foreground/90"
            value={data.body}
            field="body"
            editable={editable}
            placeholder={t("placeholder.clickToAddText")}
          />
        )}
      </div>
    </section>
  );
}
