"use client";

import {
  CircleUser,
  Columns2,
  Heading,
  Image as ImageIcon,
  ImagePlay,
  LayoutList,
  List,
  Minus,
  MoveVertical,
  PanelBottom,
  PanelTop,
  Pilcrow,
  Quote,
  RectangleHorizontal,
  Rows3,
  StretchHorizontal,
  Share2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { useTranslations } from "next-intl";

import { cn } from "../../../lib/utils";
import { Button } from "../../../ui/button";
import { useBlockLabel } from "../blocks/helpers";
import { PaletteSource } from "../canvas/dnd";
import {
  createBlock,
  createQuote,
  createSection,
  createThreeColumns,
  useDefaultText,
} from "../factory";
import { useEmailEditor } from "../store";
import type { Block, BlockType } from "../types";
import { BlockSettings } from "./block-settings";
import { ColorField, FontField, NumberField, Section } from "./controls";

interface Entry {
  key: string;
  label: string;
  icon: LucideIcon;
  create: () => Block;
}

/** The palette's entries: names in the creator's language, the blocks they
 *  create written in the site's. */
function useEntries() {
  const t = useTranslations("studio.emailEditor");
  const text = useDefaultText();
  const entry = (
    key: string,
    label: string,
    icon: LucideIcon,
    create: () => Block,
  ): Entry => ({ key, label, icon, create });
  const of = (type: BlockType, icon: LucideIcon) =>
    entry(type, t(`block.${type}`), icon, () => createBlock(type, text));
  return {
    item: of("item", Sparkles),
    basics: [
      of("heading", Heading),
      of("text", Pilcrow),
      of("button", RectangleHorizontal),
      of("image", ImageIcon),
      of("divider", Minus),
      of("spacer", MoveVertical),
    ],
    layout: [
      entry("columns", t("palette.columns2"), Columns2, () =>
        createBlock("columns", text),
      ),
      entry("columns3", t("palette.columns3"), Rows3, createThreeColumns),
      entry("section", t("palette.section"), StretchHorizontal, createSection),
    ],
    rich: [
      of("hero", ImagePlay),
      of("card", LayoutList),
      of("list", List),
      entry("quote", t("palette.quote"), Quote, () => createQuote(text)),
      of("profile", CircleUser),
      of("social", Share2),
    ],
    brand: [of("brandHeader", PanelTop), of("brandFooter", PanelBottom)],
  };
}

/** The blocks she can add: click puts one after the selected block (or at the
 *  end of the body), drag drops it anywhere. */
export function Palette({ onAdded }: { onAdded?: () => void }) {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor");
  const entries = useEntries();

  async function add(entry: Entry) {
    const block = entry.create();
    // A featured item asks what to feature first, when the app can ask.
    if (block.type === "item" && store.pickItem) {
      const picked = await store.pickItem();
      if (!picked) return;
      block.data.ref = picked.ref;
    }
    if (block.type === "brandHeader")
      store.insert(block, { region: "header", index: 0 });
    else if (block.type === "brandFooter")
      store.insert(block, { region: "footer" });
    else store.insertNearSelection(block);
    onAdded?.();
  }

  const group = (title: string, entries: Entry[]) => (
    <div className="space-y-2">
      <h4 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-1.5">
        {entries.map((entry) => (
          <PaletteSource
            key={entry.key}
            id={entry.key}
            label={entry.label}
            create={entry.create}
            onClick={() => void add(entry)}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border bg-background px-1 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-accent/50 active:cursor-grabbing"
          >
            <entry.icon className="h-5 w-5 text-muted-foreground" />
            <span className="max-w-full truncate" title={entry.label}>
              {entry.label}
            </span>
          </PaletteSource>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 p-3">
      {store.features.items && group(t("palette.yourContent"), [entries.item])}
      {group(t("palette.basics"), entries.basics)}
      {group(t("palette.layout"), entries.layout)}
      {group(t("palette.blocks"), entries.rich)}
      {store.features.brand && group(t("palette.brand"), entries.brand)}
    </div>
  );
}

/** Right column: the selected block's settings, else the email's. */
export function SettingsPanel() {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.panel");
  const blockLabel = useBlockLabel();
  const block = store.selected;
  if (!block) return <EmailSettings />;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{blockLabel(block.type)}</h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => store.select(null)}
        >
          {t("emailSettings")}
        </Button>
      </div>
      <BlockSettings key={block.id} block={block} />
    </div>
  );
}

function EmailSettings() {
  const store = useEmailEditor();
  const t = useTranslations("studio.emailEditor.panel");
  const s = store.design.settings;
  const set = store.updateSettings;
  return (
    <div>
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{t("emailSettings")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("selectBlockHint")}
        </p>
      </div>
      <Section title={t("section.colours")}>
        <ColorField
          label={t("field.pageBackground")}
          value={s.backgroundColor}
          onChange={(v) => set({ backgroundColor: v ?? "brand:surface" })}
        />
        <ColorField
          label={t("field.emailBackground")}
          value={s.bodyBackgroundColor}
          onChange={(v) =>
            set({ bodyBackgroundColor: v ?? "brand:background" })
          }
        />
        <ColorField
          label={t("field.textColour")}
          value={s.defaultColor}
          onChange={(v) => set({ defaultColor: v ?? "brand:foreground" })}
        />
      </Section>
      <Section title={t("section.text")}>
        <FontField
          label={t("field.font")}
          value={s.defaultFont}
          onChange={(defaultFont) => set({ defaultFont })}
        />
        <NumberField
          label={t("field.textSize")}
          min={12}
          max={22}
          value={s.defaultFontSize}
          onChange={(defaultFontSize) => set({ defaultFontSize })}
        />
      </Section>
      <Section title={t("section.shape")}>
        <NumberField
          label={t("field.width")}
          min={480}
          max={720}
          step={10}
          value={s.contentWidth}
          onChange={(contentWidth) => set({ contentWidth })}
        />
        <NumberField
          label={t("field.cornerRadius")}
          min={0}
          max={24}
          value={s.bodyBorderRadius ?? 0}
          onChange={(bodyBorderRadius) => set({ bodyBorderRadius })}
        />
      </Section>
    </div>
  );
}

export function PanelTabs({
  value,
  onChange,
}: {
  value: "add" | "edit";
  onChange: (v: "add" | "edit") => void;
}) {
  const t = useTranslations("studio.emailEditor.panel");
  return (
    <div className="flex rounded-lg border bg-muted/40 p-0.5" role="tablist">
      {(
        [
          ["add", t("tabAdd")],
          ["edit", t("tabEdit")],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-8 flex-1 rounded-md text-sm font-medium transition-colors",
            value === v
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
