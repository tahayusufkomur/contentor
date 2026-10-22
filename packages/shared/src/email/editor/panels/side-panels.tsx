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

import { cn } from "../../../lib/utils";
import { Button } from "../../../ui/button";
import { blockLabel } from "../blocks/helpers";
import { PaletteSource } from "../canvas/dnd";
import {
  createBlock,
  createQuote,
  createSection,
  createThreeColumns,
} from "../factory";
import { useEmailEditor } from "../store";
import type { Block } from "../types";
import { BlockSettings } from "./block-settings";
import { ColorField, FontField, NumberField, Section } from "./controls";

interface Entry {
  key: string;
  label: string;
  icon: LucideIcon;
  create: () => Block;
}

const BASICS: Entry[] = [
  {
    key: "heading",
    label: "Heading",
    icon: Heading,
    create: () => createBlock("heading"),
  },
  {
    key: "text",
    label: "Text",
    icon: Pilcrow,
    create: () => createBlock("text"),
  },
  {
    key: "button",
    label: "Button",
    icon: RectangleHorizontal,
    create: () => createBlock("button"),
  },
  {
    key: "image",
    label: "Image",
    icon: ImageIcon,
    create: () => createBlock("image"),
  },
  {
    key: "divider",
    label: "Divider",
    icon: Minus,
    create: () => createBlock("divider"),
  },
  {
    key: "spacer",
    label: "Spacer",
    icon: MoveVertical,
    create: () => createBlock("spacer"),
  },
];

const LAYOUT: Entry[] = [
  {
    key: "columns",
    label: "2 columns",
    icon: Columns2,
    create: () => createBlock("columns"),
  },
  {
    key: "columns3",
    label: "3 columns",
    icon: Rows3,
    create: createThreeColumns,
  },
  {
    key: "section",
    label: "Section",
    icon: StretchHorizontal,
    create: createSection,
  },
];

const RICH: Entry[] = [
  {
    key: "hero",
    label: "Hero",
    icon: ImagePlay,
    create: () => createBlock("hero"),
  },
  {
    key: "card",
    label: "Card",
    icon: LayoutList,
    create: () => createBlock("card"),
  },
  { key: "list", label: "List", icon: List, create: () => createBlock("list") },
  { key: "quote", label: "Quote", icon: Quote, create: createQuote },
  {
    key: "profile",
    label: "Profile",
    icon: CircleUser,
    create: () => createBlock("profile"),
  },
  {
    key: "social",
    label: "Social links",
    icon: Share2,
    create: () => createBlock("social"),
  },
];

const ITEM: Entry = {
  key: "item",
  label: "Featured item",
  icon: Sparkles,
  create: () => createBlock("item"),
};

const BRAND: Entry[] = [
  {
    key: "brandHeader",
    label: "Brand header",
    icon: PanelTop,
    create: () => createBlock("brandHeader"),
  },
  {
    key: "brandFooter",
    label: "Brand footer",
    icon: PanelBottom,
    create: () => createBlock("brandFooter"),
  },
];

/** The blocks she can add: click puts one after the selected block (or at the
 *  end of the body), drag drops it anywhere. */
export function Palette({ onAdded }: { onAdded?: () => void }) {
  const store = useEmailEditor();

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
            <span className="truncate">{entry.label}</span>
          </PaletteSource>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 p-3">
      {store.features.items && group("Your content", [ITEM])}
      {group("Basics", BASICS)}
      {group("Layout", LAYOUT)}
      {group("Blocks", RICH)}
      {store.features.brand && group("Brand", BRAND)}
    </div>
  );
}

/** Right column: the selected block's settings, else the email's. */
export function SettingsPanel() {
  const store = useEmailEditor();
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
          Email settings
        </Button>
      </div>
      <BlockSettings key={block.id} block={block} />
    </div>
  );
}

function EmailSettings() {
  const store = useEmailEditor();
  const s = store.design.settings;
  const set = store.updateSettings;
  return (
    <div>
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Email settings</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Select a block in the email to change it.
        </p>
      </div>
      <Section title="Colours">
        <ColorField
          label="Page background"
          value={s.backgroundColor}
          onChange={(v) => set({ backgroundColor: v ?? "brand:surface" })}
        />
        <ColorField
          label="Email background"
          value={s.bodyBackgroundColor}
          onChange={(v) =>
            set({ bodyBackgroundColor: v ?? "brand:background" })
          }
        />
        <ColorField
          label="Text colour"
          value={s.defaultColor}
          onChange={(v) => set({ defaultColor: v ?? "brand:foreground" })}
        />
      </Section>
      <Section title="Text">
        <FontField
          label="Font"
          value={s.defaultFont}
          onChange={(defaultFont) => set({ defaultFont })}
        />
        <NumberField
          label="Text size"
          min={12}
          max={22}
          value={s.defaultFontSize}
          onChange={(defaultFontSize) => set({ defaultFontSize })}
        />
      </Section>
      <Section title="Shape">
        <NumberField
          label="Width"
          min={480}
          max={720}
          step={10}
          value={s.contentWidth}
          onChange={(contentWidth) => set({ contentWidth })}
        />
        <NumberField
          label="Corner radius"
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
  return (
    <div className="flex rounded-lg border bg-muted/40 p-0.5" role="tablist">
      {(
        [
          ["add", "Add"],
          ["edit", "Edit"],
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
