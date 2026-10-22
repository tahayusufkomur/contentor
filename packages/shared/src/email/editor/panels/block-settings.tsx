"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "../../../ui/button";
import { useEmailEditor } from "../store";
import type {
  Block,
  BrandFooterBlock,
  BrandHeaderBlock,
  ButtonBlock,
  CardBlock,
  Column,
  ColumnsBlock,
  DividerBlock,
  HeadingBlock,
  HeroBlock,
  ImageBlock,
  ItemBlock,
  ListBlock,
  ProfileBlock,
  SocialBlock,
  SocialNetwork,
  SpacerBlock,
  TextBlock,
} from "../types";
import { mintBlockId } from "../tree";
import {
  AlignField,
  ColorField,
  FontField,
  ImageField,
  LinkField,
  NumberField,
  Section,
  Segmented,
  SelectField,
  SpacingField,
  TextAreaField,
  TextField,
  ToggleField,
  fieldClass,
} from "./controls";

type Setters<B extends Block> = {
  data: (patch: Partial<B["data"]>) => void;
  style: (patch: Partial<B["style"]>) => void;
};

function useSetters<B extends Block>(block: B): Setters<B> {
  const store = useEmailEditor();
  return {
    data: (patch) =>
      store.update(block.id, { data: patch as Record<string, unknown> }),
    style: (patch) =>
      store.update(block.id, { style: patch as Record<string, unknown> }),
  };
}

/** The settings of the selected block, grouped as Content / Style / Spacing. */
export function BlockSettings({ block }: { block: Block }) {
  switch (block.type) {
    case "text":
      return <TextSettings block={block} />;
    case "heading":
      return <HeadingSettings block={block} />;
    case "button":
      return <ButtonSettings block={block} />;
    case "image":
      return <ImageSettings block={block} />;
    case "divider":
      return <DividerSettings block={block} />;
    case "spacer":
      return <SpacerSettings block={block} />;
    case "columns":
      return <ColumnsSettings block={block} />;
    case "social":
      return <SocialSettings block={block} />;
    case "hero":
      return <HeroSettings block={block} />;
    case "card":
      return <CardSettings block={block} />;
    case "list":
      return <ListSettings block={block} />;
    case "profile":
      return <ProfileSettings block={block} />;
    case "brandHeader":
      return <BrandHeaderSettings block={block} />;
    case "brandFooter":
      return <BrandFooterSettings block={block} />;
    case "item":
      return <ItemSettings block={block} />;
    case "html":
      return (
        <Section title="Custom HTML">
          <p className="text-sm text-muted-foreground">
            This block came with an imported template. It is sent as it is and
            can be moved or deleted, not edited.
          </p>
        </Section>
      );
    default:
      return null;
  }
}

function TextSettings({ block }: { block: TextBlock }) {
  const set = useSetters(block);
  const { resolved } = useEmailEditor();
  const s = block.style;
  return (
    <>
      <Section title="Text">
        <p className="text-sm text-muted-foreground">
          Type straight into the email. Select words to make them bold, a link
          or a list; @ adds the reader’s first name.
        </p>
        <NumberField
          label="Size"
          min={11}
          max={32}
          value={s.fontSize ?? resolved.settings.defaultFontSize}
          onChange={(fontSize) => set.style({ fontSize })}
        />
        <ColorField
          label="Colour"
          value={s.color ?? "brand:foreground"}
          onChange={(color) => set.style({ color })}
        />
        <AlignField
          value={s.alignment}
          onChange={(alignment) => set.style({ alignment })}
        />
        <NumberField
          label="Line height"
          min={1}
          max={2.4}
          step={0.1}
          unit=""
          value={s.lineHeight ?? 1.6}
          onChange={(lineHeight) => set.style({ lineHeight })}
        />
      </Section>
      <Section title="Box">
        <ColorField
          label="Background"
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function HeadingSettings({ block }: { block: HeadingBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  return (
    <>
      <Section title="Heading">
        <TextField
          label="Text"
          value={d.text}
          onChange={(text) => set.data({ text })}
        />
        <Segmented<1 | 2 | 3 | 4>
          label="Level"
          value={d.level}
          onChange={(level) => set.data({ level })}
          options={[
            [1, "H1"],
            [2, "H2"],
            [3, "H3"],
            [4, "H4"],
          ]}
        />
      </Section>
      <Section title="Style">
        <FontField
          value={s.fontFamily}
          onChange={(fontFamily) => set.style({ fontFamily })}
        />
        <NumberField
          label="Size"
          min={12}
          max={64}
          value={s.fontSize}
          onChange={(fontSize) => set.style({ fontSize })}
        />
        <SelectField
          label="Weight"
          value={s.fontWeight ?? 700}
          onChange={(fontWeight) => set.style({ fontWeight })}
          options={[
            [400, "Regular"],
            [500, "Medium"],
            [600, "Semibold"],
            [700, "Bold"],
            [800, "Extra bold"],
          ]}
        />
        <ColorField
          label="Colour"
          value={s.color}
          onChange={(color) =>
            set.style({ color: color ?? "brand:foreground" })
          }
        />
        <AlignField
          value={s.alignment}
          onChange={(alignment) => set.style({ alignment })}
        />
        <NumberField
          label="Letter spacing"
          min={-2}
          max={8}
          step={0.5}
          value={s.letterSpacing ?? 0}
          onChange={(letterSpacing) => set.style({ letterSpacing })}
        />
        <ToggleField
          label="Capitals"
          checked={s.textTransform === "uppercase"}
          onChange={(on) =>
            set.style({ textTransform: on ? "uppercase" : "none" })
          }
        />
      </Section>
      <Section title="Box">
        <ColorField
          label="Background"
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function ButtonSettings({ block }: { block: ButtonBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  return (
    <>
      <Section title="Button">
        <TextField
          label="Label"
          value={d.text}
          onChange={(text) => set.data({ text })}
        />
        <LinkField value={d.url} onChange={(url) => set.data({ url })} />
      </Section>
      <Section title="Style">
        <ColorField
          label="Button colour"
          value={s.backgroundColor}
          onChange={(v) => set.style({ backgroundColor: v ?? "brand:primary" })}
        />
        <ColorField
          label="Label colour"
          value={s.color}
          onChange={(v) => set.style({ color: v ?? "brand:primaryForeground" })}
        />
        <FontField
          value={s.fontFamily}
          onChange={(fontFamily) => set.style({ fontFamily })}
        />
        <NumberField
          label="Text size"
          min={11}
          max={24}
          value={s.fontSize}
          onChange={(fontSize) => set.style({ fontSize })}
        />
        <NumberField
          label="Corner radius"
          min={0}
          max={40}
          value={s.borderRadius}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
        <ToggleField
          label="Full width"
          checked={!!s.fullWidth}
          onChange={(fullWidth) => set.style({ fullWidth })}
        />
        {!s.fullWidth && (
          <AlignField
            value={s.alignment}
            onChange={(alignment) => set.style({ alignment })}
          />
        )}
        <NumberField
          label="Inner padding (sides)"
          min={8}
          max={60}
          value={s.paddingX ?? 24}
          onChange={(paddingX) => set.style({ paddingX })}
        />
        <NumberField
          label="Inner padding (top/bottom)"
          min={4}
          max={30}
          value={s.paddingY ?? 12}
          onChange={(paddingY) => set.style({ paddingY })}
        />
      </Section>
      <Section title="Box">
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function ImageSettings({ block }: { block: ImageBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  return (
    <>
      <Section title="Image">
        <ImageField
          value={d.src}
          onPick={(src, alt, width, height) =>
            set.data({
              src,
              alt: alt || d.alt,
              height:
                width && height
                  ? Math.round((d.width * height) / width)
                  : undefined,
            })
          }
          onClear={() => set.data({ src: "" })}
        />
        <TextField
          label="Description (alt text)"
          value={d.alt}
          placeholder="What the picture shows"
          onChange={(alt) => set.data({ alt })}
          hint="Read aloud by screen readers and shown when images are off."
        />
        <LinkField
          label="Link (optional)"
          value={d.link ?? ""}
          onChange={(link) => set.data({ link })}
        />
      </Section>
      <Section title="Size">
        <ToggleField
          label="Edge to edge"
          checked={!!s.fullWidth}
          onChange={(fullWidth) => set.style({ fullWidth })}
        />
        {!s.fullWidth && (
          <>
            <NumberField
              label="Width"
              min={40}
              max={600}
              value={d.width}
              onChange={(width) => set.data({ width, height: undefined })}
            />
            <AlignField
              value={s.alignment ?? "center"}
              onChange={(alignment) => set.style({ alignment })}
            />
          </>
        )}
        <NumberField
          label="Corner radius"
          min={0}
          max={40}
          value={s.borderRadius ?? 0}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
      </Section>
      {!s.fullWidth && (
        <Section title="Box">
          <SpacingField
            value={s.padding}
            onChange={(padding) => set.style({ padding })}
          />
        </Section>
      )}
    </>
  );
}

function DividerSettings({ block }: { block: DividerBlock }) {
  const set = useSetters(block);
  const s = block.style;
  return (
    <Section title="Divider">
      <ColorField
        label="Colour"
        value={s.lineColor}
        onChange={(v) => set.style({ lineColor: v ?? "brand:border" })}
      />
      <NumberField
        label="Thickness"
        min={1}
        max={8}
        value={s.lineThickness}
        onChange={(lineThickness) => set.style({ lineThickness })}
      />
      <Segmented<"solid" | "dashed" | "dotted">
        label="Line"
        value={s.lineStyle ?? "solid"}
        onChange={(lineStyle) => set.style({ lineStyle })}
        options={[
          ["solid", "Solid"],
          ["dashed", "Dashed"],
          ["dotted", "Dotted"],
        ]}
      />
      <NumberField
        label="Space above and below"
        min={0}
        max={60}
        value={s.spacing}
        onChange={(spacing) => set.style({ spacing })}
      />
    </Section>
  );
}

function SpacerSettings({ block }: { block: SpacerBlock }) {
  const set = useSetters(block);
  const s = block.style;
  return (
    <Section title="Spacer">
      <NumberField
        label="Height"
        min={4}
        max={160}
        value={s.height}
        onChange={(height) => set.style({ height })}
      />
      <ColorField
        label="Background"
        allowNone
        value={s.backgroundColor}
        onChange={(backgroundColor) => set.style({ backgroundColor })}
      />
    </Section>
  );
}

const RATIOS: Record<number, [string, number[]][]> = {
  1: [["Full", [100]]],
  2: [
    ["Half / half", [50, 50]],
    ["Third / two thirds", [33, 67]],
    ["Two thirds / third", [67, 33]],
  ],
  3: [["Thirds", [33, 33, 34]]],
};

function ColumnsSettings({ block }: { block: ColumnsBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  const count = d.columns.length;

  function setCount(next: number) {
    if (next === count) return;
    let columns: Column[];
    if (next > count) {
      columns = [
        ...d.columns,
        ...Array.from({ length: next - count }, () => ({
          id: mintBlockId(),
          blocks: [] as Block[],
        })),
      ];
    } else {
      // Fewer columns: nothing is lost, the dropped columns' blocks join the last kept one.
      const kept = d.columns.slice(0, next);
      const moved = d.columns.slice(next).flatMap((c) => c.blocks);
      columns = kept.map((c, i) =>
        i === next - 1 ? { ...c, blocks: [...c.blocks, ...moved] } : c,
      );
    }
    set.data({ columns, columnCount: next, columnRatio: RATIOS[next][0][1] });
  }

  const background = d.columns[0]?.backgroundColor ?? null;
  const ratioKey = (d.columnRatio ?? []).join("/");
  const ratioOptions = RATIOS[count] ?? [];
  return (
    <>
      <Section title="Columns">
        <Segmented<number>
          label="How many"
          value={count}
          onChange={setCount}
          options={[
            [1, "1"],
            [2, "2"],
            [3, "3"],
          ]}
        />
        {ratioOptions.length > 1 && (
          <SelectField
            label="Widths"
            value={
              ratioOptions.some(([, r]) => r.join("/") === ratioKey)
                ? ratioKey
                : ratioOptions[0][1].join("/")
            }
            onChange={(key) =>
              set.data({ columnRatio: key.split("/").map(Number) })
            }
            options={ratioOptions.map(
              ([name, r]) => [r.join("/"), name] as [string, string],
            )}
          />
        )}
        <NumberField
          label="Gap"
          min={0}
          max={48}
          value={s.gap ?? 10}
          onChange={(gap) => set.style({ gap })}
        />
        <Segmented<"top" | "center" | "bottom">
          label="Vertical alignment"
          value={s.verticalAlignment ?? "top"}
          onChange={(verticalAlignment) => set.style({ verticalAlignment })}
          options={[
            ["top", "Top"],
            ["center", "Middle"],
            ["bottom", "Bottom"],
          ]}
        />
        <ToggleField
          label="Stack on phones"
          checked={s.stackOnMobile !== false}
          onChange={(stackOnMobile) => set.style({ stackOnMobile })}
        />
      </Section>
      <Section title="Box">
        <ColorField
          label="Column background"
          allowNone
          value={background}
          onChange={(backgroundColor) =>
            set.data({
              columns: d.columns.map((c) => ({ ...c, backgroundColor })),
            })
          }
        />
        <NumberField
          label="Column corner radius"
          min={0}
          max={32}
          value={d.columns[0]?.borderRadius ?? 0}
          onChange={(borderRadius) =>
            set.data({
              columns: d.columns.map((c) => ({ ...c, borderRadius })),
            })
          }
        />
      </Section>
    </>
  );
}

const NETWORK_OPTIONS: [SocialNetwork, string][] = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
  ["tiktok", "TikTok"],
  ["linkedin", "LinkedIn"],
  ["twitter", "X (Twitter)"],
];

function SocialSettings({ block }: { block: SocialBlock }) {
  const set = useSetters(block);
  const { kit } = useEmailEditor();
  const { data: d, style: s } = block;
  const platforms = d.platforms;
  const known = kit.socials.filter((x) =>
    NETWORK_OPTIONS.some(([n]) => n === x.network),
  );
  return (
    <>
      <Section title="Profiles">
        {known.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() =>
              set.data({
                platforms: known.map((x) => ({
                  type: x.network as SocialNetwork,
                  url: x.url,
                })),
              })
            }
          >
            Use my profiles
          </Button>
        )}
        {platforms.map((p, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Network"
                value={p.type}
                onChange={(e) =>
                  set.data({
                    platforms: platforms.map((x, j) =>
                      j === i
                        ? { ...x, type: e.target.value as SocialNetwork }
                        : x,
                    ),
                  })
                }
                className={fieldClass}
              >
                {NETWORK_OPTIONS.map(([v, name]) => (
                  <option key={v} value={v}>
                    {name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                aria-label="Remove profile"
                onClick={() =>
                  set.data({ platforms: platforms.filter((_, j) => j !== i) })
                }
              >
                <Trash2 />
              </Button>
            </div>
            <input
              aria-label="Profile link"
              value={p.url}
              placeholder="https://"
              onChange={(e) =>
                set.data({
                  platforms: platforms.map((x, j) =>
                    j === i ? { ...x, url: e.target.value } : x,
                  ),
                })
              }
              className={fieldClass}
            />
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            set.data({
              platforms: [...platforms, { type: "instagram", url: "https://" }],
            })
          }
        >
          <Plus /> Add a profile
        </Button>
      </Section>
      <Section title="Style">
        <NumberField
          label="Icon size"
          min={16}
          max={48}
          value={s.iconSize ?? 32}
          onChange={(iconSize) => set.style({ iconSize })}
        />
        <Segmented<"colored" | "monochrome">
          label="Icons"
          value={s.iconStyle ?? "colored"}
          onChange={(iconStyle) => set.style({ iconStyle })}
          options={[
            ["colored", "Colour"],
            ["monochrome", "Grey"],
          ]}
        />
        <AlignField
          value={s.alignment ?? "center"}
          onChange={(alignment) => set.style({ alignment })}
        />
        <NumberField
          label="Space between"
          min={0}
          max={32}
          value={s.spacing ?? 10}
          onChange={(spacing) => set.style({ spacing })}
        />
      </Section>
      <Section title="Box">
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function HeroSettings({ block }: { block: HeroBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  return (
    <>
      <Section title="Hero">
        <ImageField
          label="Background image"
          value={d.backgroundImage}
          onPick={(backgroundImage) => set.data({ backgroundImage })}
          onClear={() => set.data({ backgroundImage: "" })}
        />
        <TextField
          label="Headline"
          value={d.heading}
          onChange={(heading) => set.data({ heading })}
        />
        <TextAreaField
          label="Supporting line"
          rows={2}
          value={d.subheading}
          onChange={(subheading) => set.data({ subheading })}
        />
        <TextField
          label="Button label"
          value={d.buttonText}
          onChange={(buttonText) => set.data({ buttonText })}
          placeholder="Leave empty for no button"
        />
        {d.buttonText && (
          <LinkField
            label="Button link"
            value={d.buttonUrl}
            onChange={(buttonUrl) => set.data({ buttonUrl })}
          />
        )}
      </Section>
      <Section title="Style">
        <NumberField
          label="Height"
          min={200}
          max={600}
          value={s.height ?? 360}
          onChange={(height) => set.style({ height })}
        />
        <ColorField
          label="Shade colour"
          value={s.overlayColor ?? "#000000"}
          onChange={(v) => set.style({ overlayColor: v ?? "#000000" })}
        />
        <NumberField
          label="Shade strength"
          min={0}
          max={0.9}
          step={0.05}
          unit=""
          value={s.overlayOpacity ?? 0.4}
          onChange={(overlayOpacity) => set.style({ overlayOpacity })}
        />
        <FontField
          label="Headline font"
          value={s.headingFontFamily}
          onChange={(headingFontFamily) => set.style({ headingFontFamily })}
        />
        <NumberField
          label="Headline size"
          min={18}
          max={60}
          value={s.headingFontSize ?? 34}
          onChange={(headingFontSize) => set.style({ headingFontSize })}
        />
        <ColorField
          label="Headline colour"
          value={s.headingColor ?? "#ffffff"}
          onChange={(v) => set.style({ headingColor: v ?? "#ffffff" })}
        />
        <ColorField
          label="Button colour"
          value={s.buttonBackgroundColor}
          onChange={(v) =>
            set.style({ buttonBackgroundColor: v ?? "brand:primary" })
          }
        />
        <ColorField
          label="Button label colour"
          value={s.buttonTextColor}
          onChange={(v) =>
            set.style({ buttonTextColor: v ?? "brand:primaryForeground" })
          }
        />
        <AlignField
          label="Text alignment"
          value={s.contentAlignment ?? "center"}
          onChange={(contentAlignment) => set.style({ contentAlignment })}
        />
        <Segmented<"top" | "center" | "bottom">
          label="Text position"
          value={s.verticalAlignment ?? "bottom"}
          onChange={(verticalAlignment) => set.style({ verticalAlignment })}
          options={[
            ["top", "Top"],
            ["center", "Middle"],
            ["bottom", "Bottom"],
          ]}
        />
      </Section>
    </>
  );
}

function CardSettings({ block }: { block: CardBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  return (
    <>
      <Section title="Card">
        <TextField
          label="Title"
          value={d.heading}
          onChange={(heading) => set.data({ heading })}
        />
        <TextAreaField
          label="Text"
          value={d.body}
          onChange={(body) => set.data({ body })}
        />
        <ToggleField
          label="Emoji on top"
          checked={d.showIcon}
          onChange={(showIcon) => set.data({ showIcon, iconMode: "emoji" })}
        />
        {d.showIcon && (
          <TextField
            label="Emoji"
            value={d.iconEmoji}
            onChange={(iconEmoji) =>
              set.data({ iconEmoji: iconEmoji.slice(0, 4), iconMode: "emoji" })
            }
          />
        )}
        <ToggleField
          label="Badge"
          checked={d.showBadge}
          onChange={(showBadge) => set.data({ showBadge })}
        />
        {d.showBadge && (
          <TextField
            label="Badge text"
            value={d.badgeText}
            onChange={(badgeText) => set.data({ badgeText })}
          />
        )}
        <ToggleField
          label="Button"
          checked={d.showButton}
          onChange={(showButton) => set.data({ showButton })}
        />
        {d.showButton && (
          <>
            <TextField
              label="Button label"
              value={d.buttonText}
              onChange={(buttonText) => set.data({ buttonText })}
            />
            <LinkField
              label="Button link"
              value={d.buttonUrl}
              onChange={(buttonUrl) => set.data({ buttonUrl })}
            />
          </>
        )}
      </Section>
      <Section title="Style">
        <ColorField
          label="Card colour"
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <NumberField
          label="Corner radius"
          min={0}
          max={32}
          value={s.borderRadius ?? 12}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
        <NumberField
          label="Border"
          min={0}
          max={4}
          value={s.borderWidth ?? 0}
          onChange={(borderWidth) => set.style({ borderWidth })}
        />
        {(s.borderWidth ?? 0) > 0 && (
          <ColorField
            label="Border colour"
            value={s.borderColor}
            onChange={(v) => set.style({ borderColor: v ?? "brand:border" })}
          />
        )}
        <FontField
          label="Title font"
          value={s.headingFontFamily}
          onChange={(headingFontFamily) => set.style({ headingFontFamily })}
        />
        <ColorField
          label="Title colour"
          value={s.headingColor}
          onChange={(v) => set.style({ headingColor: v ?? "brand:foreground" })}
        />
        <ColorField
          label="Text colour"
          value={s.bodyColor}
          onChange={(v) => set.style({ bodyColor: v ?? "brand:muted" })}
        />
        {d.showButton && (
          <>
            <ColorField
              label="Button colour"
              value={s.buttonBackgroundColor}
              onChange={(v) =>
                set.style({ buttonBackgroundColor: v ?? "brand:primary" })
              }
            />
            <ColorField
              label="Button label colour"
              value={s.buttonTextColor}
              onChange={(v) =>
                set.style({ buttonTextColor: v ?? "brand:primaryForeground" })
              }
            />
          </>
        )}
        <AlignField
          value={s.contentAlignment ?? "center"}
          onChange={(contentAlignment) => set.style({ contentAlignment })}
        />
      </Section>
      <Section title="Box">
        <SpacingField
          label="Inner padding"
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function ListSettings({ block }: { block: ListBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  const items = d.items;
  const setItems = (next: ListBlock["data"]["items"]) =>
    set.data({ items: next });
  return (
    <>
      <Section title="Items">
        {items.map((item, i) => (
          <div key={item.id} className="space-y-1.5 rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <input
                aria-label="Bullet"
                value={item.icon}
                onChange={(e) =>
                  setItems(
                    items.map((x) =>
                      x.id === item.id
                        ? {
                            ...x,
                            icon: e.target.value.slice(0, 3),
                            iconMode: "text",
                          }
                        : x,
                    ),
                  )
                }
                className={`${fieldClass} w-12 text-center`}
              />
              <input
                aria-label="Item text"
                value={item.text}
                onChange={(e) =>
                  setItems(
                    items.map((x) =>
                      x.id === item.id ? { ...x, text: e.target.value } : x,
                    ),
                  )
                }
                className={fieldClass}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <input
                aria-label="Item detail"
                value={item.subtitle}
                placeholder="Detail (optional)"
                onChange={(e) =>
                  setItems(
                    items.map((x) =>
                      x.id === item.id ? { ...x, subtitle: e.target.value } : x,
                    ),
                  )
                }
                className={fieldClass}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                aria-label="Move item up"
                disabled={i === 0}
                onClick={() =>
                  setItems([
                    ...items.slice(0, i - 1),
                    item,
                    items[i - 1],
                    ...items.slice(i + 1),
                  ])
                }
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                aria-label="Move item down"
                disabled={i === items.length - 1}
                onClick={() =>
                  setItems([
                    ...items.slice(0, i),
                    items[i + 1],
                    item,
                    ...items.slice(i + 2),
                  ])
                }
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                aria-label="Remove item"
                onClick={() => setItems(items.filter((x) => x.id !== item.id))}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() =>
            setItems([
              ...items,
              {
                id: mintBlockId(),
                icon: items[0]?.icon ?? "✓",
                text: "",
                subtitle: "",
              },
            ])
          }
        >
          <Plus /> Add an item
        </Button>
      </Section>
      <Section title="Style">
        <ColorField
          label="Bullet colour"
          value={s.iconColor}
          onChange={(v) => set.style({ iconColor: v ?? "brand:primary" })}
        />
        <ColorField
          label="Text colour"
          value={s.textColor}
          onChange={(v) => set.style({ textColor: v ?? "brand:foreground" })}
        />
        <FontField
          value={s.textFontFamily}
          onChange={(textFontFamily) => set.style({ textFontFamily })}
        />
        <NumberField
          label="Text size"
          min={11}
          max={24}
          value={s.textFontSize ?? 15}
          onChange={(textFontSize) => set.style({ textFontSize })}
        />
        <Segmented<"vertical" | "horizontal">
          label="Layout"
          value={s.layout ?? "vertical"}
          onChange={(layout) => set.style({ layout })}
          options={[
            ["vertical", "Stacked"],
            ["horizontal", "In a row"],
          ]}
        />
        <NumberField
          label="Space between"
          min={0}
          max={32}
          value={s.spacing ?? 12}
          onChange={(spacing) => set.style({ spacing })}
        />
      </Section>
      <Section title="Box">
        <ColorField
          label="Background"
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function ProfileSettings({ block }: { block: ProfileBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  return (
    <>
      <Section title="Profile">
        <ImageField
          label="Photo"
          value={d.imageSrc}
          onPick={(imageSrc, alt) =>
            set.data({ imageSrc, imageAlt: alt || d.imageAlt })
          }
          onClear={() => set.data({ imageSrc: "" })}
        />
        <TextField
          label="Name"
          value={d.name}
          onChange={(name) => set.data({ name })}
        />
        <TextField
          label="Role"
          value={d.role}
          onChange={(role) => set.data({ role })}
        />
        <TextAreaField
          label="Bio"
          value={d.bio}
          onChange={(bio) => set.data({ bio })}
        />
        <ToggleField
          label="Badge"
          checked={d.showBadge}
          onChange={(showBadge) => set.data({ showBadge })}
        />
        {d.showBadge && (
          <TextField
            label="Badge text"
            value={d.badgeText}
            onChange={(badgeText) => set.data({ badgeText })}
          />
        )}
      </Section>
      <Section title="Style">
        <Segmented<"left" | "right" | "top">
          label="Photo position"
          value={s.imagePosition ?? "left"}
          onChange={(imagePosition) => set.style({ imagePosition })}
          options={[
            ["left", "Left"],
            ["top", "Top"],
            ["right", "Right"],
          ]}
        />
        <NumberField
          label="Photo size"
          min={40}
          max={160}
          value={s.imageSize ?? 72}
          onChange={(imageSize) => set.style({ imageSize })}
        />
        <ColorField
          label="Card colour"
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <ColorField
          label="Name colour"
          value={s.nameColor}
          onChange={(v) => set.style({ nameColor: v ?? "brand:foreground" })}
        />
        <ColorField
          label="Role colour"
          value={s.roleColor}
          onChange={(v) => set.style({ roleColor: v ?? "brand:primary" })}
        />
        <ColorField
          label="Bio colour"
          value={s.bioColor}
          onChange={(v) => set.style({ bioColor: v ?? "brand:muted" })}
        />
        <NumberField
          label="Corner radius"
          min={0}
          max={32}
          value={s.borderRadius ?? 12}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
      </Section>
      <Section title="Box">
        <SpacingField
          label="Inner padding"
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function BrandHeaderSettings({ block }: { block: BrandHeaderBlock }) {
  const set = useSetters(block);
  const { data: d, style: s } = block;
  return (
    <>
      <Section title="Brand header">
        <p className="text-sm text-muted-foreground">
          Your logo and name come from your brand, so every email updates when
          they change.
        </p>
        <SelectField<BrandHeaderBlock["data"]["variant"]>
          label="Show"
          value={d.variant}
          onChange={(variant) => set.data({ variant })}
          options={[
            ["logo", "Logo"],
            ["logoName", "Logo and name"],
            ["mark", "Square mark"],
            ["name", "Name only"],
          ]}
        />
        {d.variant !== "name" && (
          <NumberField
            label="Logo height"
            min={20}
            max={120}
            value={s.logoHeight ?? 44}
            onChange={(logoHeight) => set.style({ logoHeight })}
          />
        )}
        <AlignField
          value={s.alignment ?? "center"}
          onChange={(alignment) => set.style({ alignment })}
        />
        {d.variant !== "logo" && d.variant !== "mark" && (
          <ColorField
            label="Name colour"
            value={s.color}
            onChange={(color) =>
              set.style({ color: color ?? "brand:foreground" })
            }
          />
        )}
      </Section>
      <Section title="Box">
        <ColorField
          label="Background"
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function BrandFooterSettings({ block }: { block: BrandFooterBlock }) {
  const set = useSetters(block);
  const { kit } = useEmailEditor();
  const { data: d, style: s } = block;
  return (
    <>
      <Section title="Brand footer">
        <p className="text-sm text-muted-foreground">
          Your name, site and profiles come from your brand. The unsubscribe
          link is always there.
        </p>
        <ToggleField
          label="Social profiles"
          checked={d.showSocial}
          onChange={(showSocial) => set.data({ showSocial })}
        />
        <ToggleField
          label="Address"
          checked={d.showAddress}
          onChange={(showAddress) => set.data({ showAddress })}
        />
        {d.showAddress && !kit.address && (
          <p className="text-xs text-muted-foreground">
            Add your address in your contact details and it shows here.
          </p>
        )}
        <TextAreaField
          label="Note"
          rows={2}
          value={d.note}
          placeholder="e.g. You get this because you joined my classes."
          onChange={(note) => set.data({ note })}
        />
      </Section>
      <Section title="Style">
        <ColorField
          label="Text colour"
          value={s.color}
          onChange={(color) => set.style({ color: color ?? "brand:muted" })}
        />
        <NumberField
          label="Text size"
          min={10}
          max={16}
          value={s.fontSize ?? 13}
          onChange={(fontSize) => set.style({ fontSize })}
        />
        <AlignField
          value={s.alignment ?? "center"}
          onChange={(alignment) => set.style({ alignment })}
        />
        <ColorField
          label="Background"
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

const KIND_LABELS: Record<string, string> = {
  course: "Course",
  live: "Live class",
  stream: "Live stream",
  zoom: "Zoom class",
  onsite: "In person",
  event: "Event",
  download: "Download",
  post: "Post",
  plan: "Membership",
  page: "Page",
  subscription: "Membership",
  "blog post": "Post",
};

function ItemSettings({ block }: { block: ItemBlock }) {
  const set = useSetters(block);
  const store = useEmailEditor();
  const { data: d, style: s } = block;
  const current = store.items.find((i) => i.ref === d.ref);
  const options: [string, string][] = [
    ["", "Choose what to feature…"],
    ...store.items.map(
      (i) =>
        [i.ref, `${KIND_LABELS[i.kind] ?? i.kind}: ${i.title}`] as [
          string,
          string,
        ],
    ),
  ];
  if (d.ref && !current) options.push([d.ref, "No longer available"]);
  return (
    <>
      <Section title="Featured item">
        <SelectField
          label="Feature"
          value={d.ref}
          options={options}
          onChange={(ref) => set.data({ ref })}
        />
        {store.pickItem && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={async () => {
              const picked = await store.pickItem?.();
              if (picked) set.data({ ref: picked.ref });
            }}
          >
            Browse your offers…
          </Button>
        )}
        {current && (
          <p className="text-xs text-muted-foreground">
            Its title, picture, {current.meta ? "price or date, " : ""}and link
            stay up to date: the email shows it as it is when it is sent.
          </p>
        )}
        <Segmented<ItemBlock["data"]["layout"]>
          label="Layout"
          value={d.layout}
          onChange={(layout) => set.data({ layout })}
          options={[
            ["card", "Card"],
            ["row", "Row"],
            ["compact", "Compact"],
          ]}
        />
        {d.layout !== "compact" && (
          <>
            <ToggleField
              label="Picture"
              checked={d.showImage}
              onChange={(showImage) => set.data({ showImage })}
            />
            <ToggleField
              label="Description"
              checked={d.showSummary}
              onChange={(showSummary) => set.data({ showSummary })}
            />
          </>
        )}
        <ToggleField
          label="Price or date"
          checked={d.showMeta}
          onChange={(showMeta) => set.data({ showMeta })}
        />
        {d.layout !== "compact" && (
          <TextField
            label="Button label"
            value={d.buttonText}
            placeholder="Leave empty for no button"
            onChange={(buttonText) => set.data({ buttonText })}
          />
        )}
      </Section>
      <Section title="Style">
        <ColorField
          label="Card colour"
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <ColorField
          label="Title colour"
          value={s.titleColor}
          onChange={(v) => set.style({ titleColor: v ?? "brand:foreground" })}
        />
        <ColorField
          label="Text colour"
          value={s.textColor}
          onChange={(v) => set.style({ textColor: v ?? "brand:muted" })}
        />
        <ColorField
          label="Button colour"
          value={s.buttonColor}
          onChange={(v) => set.style({ buttonColor: v ?? "brand:primary" })}
        />
        <ColorField
          label="Button label colour"
          value={s.buttonTextColor}
          onChange={(v) =>
            set.style({ buttonTextColor: v ?? "brand:primaryForeground" })
          }
        />
        <NumberField
          label="Corner radius"
          min={0}
          max={32}
          value={s.borderRadius ?? 12}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
      </Section>
      <Section title="Box">
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}
