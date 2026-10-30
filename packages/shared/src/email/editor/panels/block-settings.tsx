"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("studio.emailEditor.settings");
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
        <Section title={t("section.customHtml")}>
          <p className="text-sm text-muted-foreground">
            {t("hint.customHtml")}
          </p>
        </Section>
      );
    default:
      return null;
  }
}

function TextSettings({ block }: { block: TextBlock }) {
  const set = useSetters(block);
  const t = useTranslations("studio.emailEditor.settings");
  const { resolved } = useEmailEditor();
  const s = block.style;
  return (
    <>
      <Section title={t("section.text")}>
        <p className="text-sm text-muted-foreground">{t("hint.text")}</p>
        <NumberField
          label={t("field.size")}
          min={11}
          max={32}
          value={s.fontSize ?? resolved.settings.defaultFontSize}
          onChange={(fontSize) => set.style({ fontSize })}
        />
        <ColorField
          label={t("field.colour")}
          value={s.color ?? "brand:foreground"}
          onChange={(color) => set.style({ color })}
        />
        <AlignField
          value={s.alignment}
          onChange={(alignment) => set.style({ alignment })}
        />
        <NumberField
          label={t("field.lineHeight")}
          min={1}
          max={2.4}
          step={0.1}
          unit=""
          value={s.lineHeight ?? 1.6}
          onChange={(lineHeight) => set.style({ lineHeight })}
        />
      </Section>
      <Section title={t("section.box")}>
        <ColorField
          label={t("field.background")}
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
  const t = useTranslations("studio.emailEditor.settings");
  const { data: d, style: s } = block;
  return (
    <>
      <Section title={t("section.heading")}>
        <TextField
          label={t("field.text")}
          value={d.text}
          onChange={(text) => set.data({ text })}
        />
        <Segmented<1 | 2 | 3 | 4>
          label={t("field.level")}
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
      <Section title={t("section.style")}>
        <FontField
          value={s.fontFamily}
          onChange={(fontFamily) => set.style({ fontFamily })}
        />
        <NumberField
          label={t("field.size")}
          min={12}
          max={64}
          value={s.fontSize}
          onChange={(fontSize) => set.style({ fontSize })}
        />
        <SelectField
          label={t("field.weight")}
          value={s.fontWeight ?? 700}
          onChange={(fontWeight) => set.style({ fontWeight })}
          options={[
            [400, t("option.regular")],
            [500, t("option.medium")],
            [600, t("option.semibold")],
            [700, t("option.bold")],
            [800, t("option.extraBold")],
          ]}
        />
        <ColorField
          label={t("field.colour")}
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
          label={t("field.letterSpacing")}
          min={-2}
          max={8}
          step={0.5}
          value={s.letterSpacing ?? 0}
          onChange={(letterSpacing) => set.style({ letterSpacing })}
        />
        <ToggleField
          label={t("field.capitals")}
          checked={s.textTransform === "uppercase"}
          onChange={(on) =>
            set.style({ textTransform: on ? "uppercase" : "none" })
          }
        />
      </Section>
      <Section title={t("section.box")}>
        <ColorField
          label={t("field.background")}
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
  const t = useTranslations("studio.emailEditor.settings");
  const { data: d, style: s } = block;
  return (
    <>
      <Section title={t("section.button")}>
        <TextField
          label={t("field.label")}
          value={d.text}
          onChange={(text) => set.data({ text })}
        />
        <LinkField value={d.url} onChange={(url) => set.data({ url })} />
      </Section>
      <Section title={t("section.style")}>
        <ColorField
          label={t("field.buttonColour")}
          value={s.backgroundColor}
          onChange={(v) => set.style({ backgroundColor: v ?? "brand:primary" })}
        />
        <ColorField
          label={t("field.labelColour")}
          value={s.color}
          onChange={(v) => set.style({ color: v ?? "brand:primaryForeground" })}
        />
        <FontField
          value={s.fontFamily}
          onChange={(fontFamily) => set.style({ fontFamily })}
        />
        <NumberField
          label={t("field.textSize")}
          min={11}
          max={24}
          value={s.fontSize}
          onChange={(fontSize) => set.style({ fontSize })}
        />
        <NumberField
          label={t("field.cornerRadius")}
          min={0}
          max={40}
          value={s.borderRadius}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
        <ToggleField
          label={t("field.fullWidth")}
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
          label={t("field.innerPaddingSides")}
          min={8}
          max={60}
          value={s.paddingX ?? 24}
          onChange={(paddingX) => set.style({ paddingX })}
        />
        <NumberField
          label={t("field.innerPaddingVertical")}
          min={4}
          max={30}
          value={s.paddingY ?? 12}
          onChange={(paddingY) => set.style({ paddingY })}
        />
      </Section>
      <Section title={t("section.box")}>
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
  const t = useTranslations("studio.emailEditor.settings");
  const { data: d, style: s } = block;
  return (
    <>
      <Section title={t("section.image")}>
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
          label={t("field.altText")}
          value={d.alt}
          placeholder={t("placeholder.altTextExample")}
          onChange={(alt) => set.data({ alt })}
          hint={t("hint.altTextHint")}
        />
        <LinkField
          label={t("field.linkOptional")}
          value={d.link ?? ""}
          onChange={(link) => set.data({ link })}
        />
      </Section>
      <Section title={t("section.size")}>
        <ToggleField
          label={t("field.edgeToEdge")}
          checked={!!s.fullWidth}
          onChange={(fullWidth) => set.style({ fullWidth })}
        />
        {!s.fullWidth && (
          <>
            <NumberField
              label={t("field.width")}
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
          label={t("field.cornerRadius")}
          min={0}
          max={40}
          value={s.borderRadius ?? 0}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
      </Section>
      {!s.fullWidth && (
        <Section title={t("section.box")}>
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
  const t = useTranslations("studio.emailEditor.settings");
  const s = block.style;
  return (
    <Section title={t("section.divider")}>
      <ColorField
        label={t("field.colour")}
        value={s.lineColor}
        onChange={(v) => set.style({ lineColor: v ?? "brand:border" })}
      />
      <NumberField
        label={t("field.thickness")}
        min={1}
        max={8}
        value={s.lineThickness}
        onChange={(lineThickness) => set.style({ lineThickness })}
      />
      <Segmented<"solid" | "dashed" | "dotted">
        label={t("field.line")}
        value={s.lineStyle ?? "solid"}
        onChange={(lineStyle) => set.style({ lineStyle })}
        options={[
          ["solid", t("option.solid")],
          ["dashed", t("option.dashed")],
          ["dotted", t("option.dotted")],
        ]}
      />
      <NumberField
        label={t("field.spaceAboveAndBelow")}
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
  const t = useTranslations("studio.emailEditor.settings");
  const s = block.style;
  return (
    <Section title={t("section.spacer")}>
      <NumberField
        label={t("field.height")}
        min={4}
        max={160}
        value={s.height}
        onChange={(height) => set.style({ height })}
      />
      <ColorField
        label={t("field.background")}
        allowNone
        value={s.backgroundColor}
        onChange={(backgroundColor) => set.style({ backgroundColor })}
      />
    </Section>
  );
}

type RatioName =
  "full" | "half" | "thirdTwoThirds" | "twoThirdsThird" | "thirds";
const RATIOS: Record<number, [RatioName, number[]][]> = {
  1: [["full", [100]]],
  2: [
    ["half", [50, 50]],
    ["thirdTwoThirds", [33, 67]],
    ["twoThirdsThird", [67, 33]],
  ],
  3: [["thirds", [33, 33, 34]]],
};

function ColumnsSettings({ block }: { block: ColumnsBlock }) {
  const set = useSetters(block);
  const t = useTranslations("studio.emailEditor.settings");
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
      <Section title={t("section.columns")}>
        <Segmented<number>
          label={t("field.howMany")}
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
            label={t("field.widths")}
            value={
              ratioOptions.some(([, r]) => r.join("/") === ratioKey)
                ? ratioKey
                : ratioOptions[0][1].join("/")
            }
            onChange={(key) =>
              set.data({ columnRatio: key.split("/").map(Number) })
            }
            options={ratioOptions.map(
              ([name, r]) =>
                [r.join("/"), t(`ratio.${name}`)] as [string, string],
            )}
          />
        )}
        <NumberField
          label={t("field.gap")}
          min={0}
          max={48}
          value={s.gap ?? 10}
          onChange={(gap) => set.style({ gap })}
        />
        <Segmented<"top" | "center" | "bottom">
          label={t("field.verticalAlignment")}
          value={s.verticalAlignment ?? "top"}
          onChange={(verticalAlignment) => set.style({ verticalAlignment })}
          options={[
            ["top", t("option.top")],
            ["center", t("option.middle")],
            ["bottom", t("option.bottom")],
          ]}
        />
        <ToggleField
          label={t("field.stackOnPhones")}
          checked={s.stackOnMobile !== false}
          onChange={(stackOnMobile) => set.style({ stackOnMobile })}
        />
      </Section>
      <Section title={t("section.box")}>
        <ColorField
          label={t("field.columnBackground")}
          allowNone
          value={background}
          onChange={(backgroundColor) =>
            set.data({
              columns: d.columns.map((c) => ({ ...c, backgroundColor })),
            })
          }
        />
        <NumberField
          label={t("field.columnCornerRadius")}
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
  const t = useTranslations("studio.emailEditor.settings");
  const { kit } = useEmailEditor();
  const { data: d, style: s } = block;
  const platforms = d.platforms;
  const known = kit.socials.filter((x) =>
    NETWORK_OPTIONS.some(([n]) => n === x.network),
  );
  return (
    <>
      <Section title={t("section.profiles")}>
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
            {t("action.useMyProfiles")}
          </Button>
        )}
        {platforms.map((p, i) => (
          <div key={i} className="space-y-1.5 rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <select
                aria-label={t("aria.network")}
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
                aria-label={t("aria.removeProfile")}
                onClick={() =>
                  set.data({ platforms: platforms.filter((_, j) => j !== i) })
                }
              >
                <Trash2 />
              </Button>
            </div>
            <input
              aria-label={t("aria.profileLink")}
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
          <Plus /> {t("action.addProfile")}
        </Button>
      </Section>
      <Section title={t("section.style")}>
        <NumberField
          label={t("field.iconSize")}
          min={16}
          max={48}
          value={s.iconSize ?? 32}
          onChange={(iconSize) => set.style({ iconSize })}
        />
        <Segmented<"colored" | "monochrome">
          label={t("field.icons")}
          value={s.iconStyle ?? "colored"}
          onChange={(iconStyle) => set.style({ iconStyle })}
          options={[
            ["colored", t("option.colour")],
            ["monochrome", t("option.grey")],
          ]}
        />
        <AlignField
          value={s.alignment ?? "center"}
          onChange={(alignment) => set.style({ alignment })}
        />
        <NumberField
          label={t("field.spaceBetween")}
          min={0}
          max={32}
          value={s.spacing ?? 10}
          onChange={(spacing) => set.style({ spacing })}
        />
      </Section>
      <Section title={t("section.box")}>
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
  const t = useTranslations("studio.emailEditor.settings");
  const { data: d, style: s } = block;
  return (
    <>
      <Section title={t("section.hero")}>
        <ImageField
          label={t("field.backgroundImage")}
          value={d.backgroundImage}
          onPick={(backgroundImage) => set.data({ backgroundImage })}
          onClear={() => set.data({ backgroundImage: "" })}
        />
        <TextField
          label={t("field.headline")}
          value={d.heading}
          onChange={(heading) => set.data({ heading })}
        />
        <TextAreaField
          label={t("field.supportingLine")}
          rows={2}
          value={d.subheading}
          onChange={(subheading) => set.data({ subheading })}
        />
        <TextField
          label={t("field.buttonLabel")}
          value={d.buttonText}
          onChange={(buttonText) => set.data({ buttonText })}
          placeholder={t("placeholder.noButton")}
        />
        {d.buttonText && (
          <LinkField
            label={t("field.buttonLink")}
            value={d.buttonUrl}
            onChange={(buttonUrl) => set.data({ buttonUrl })}
          />
        )}
      </Section>
      <Section title={t("section.style")}>
        <NumberField
          label={t("field.height")}
          min={200}
          max={600}
          value={s.height ?? 360}
          onChange={(height) => set.style({ height })}
        />
        <ColorField
          label={t("field.shadeColour")}
          value={s.overlayColor ?? "#000000"}
          onChange={(v) => set.style({ overlayColor: v ?? "#000000" })}
        />
        <NumberField
          label={t("field.shadeStrength")}
          min={0}
          max={0.9}
          step={0.05}
          unit=""
          value={s.overlayOpacity ?? 0.4}
          onChange={(overlayOpacity) => set.style({ overlayOpacity })}
        />
        <FontField
          label={t("field.headlineFont")}
          value={s.headingFontFamily}
          onChange={(headingFontFamily) => set.style({ headingFontFamily })}
        />
        <NumberField
          label={t("field.headlineSize")}
          min={18}
          max={60}
          value={s.headingFontSize ?? 34}
          onChange={(headingFontSize) => set.style({ headingFontSize })}
        />
        <ColorField
          label={t("field.headlineColour")}
          value={s.headingColor ?? "#ffffff"}
          onChange={(v) => set.style({ headingColor: v ?? "#ffffff" })}
        />
        <ColorField
          label={t("field.buttonColour")}
          value={s.buttonBackgroundColor}
          onChange={(v) =>
            set.style({ buttonBackgroundColor: v ?? "brand:primary" })
          }
        />
        <ColorField
          label={t("field.buttonLabelColour")}
          value={s.buttonTextColor}
          onChange={(v) =>
            set.style({ buttonTextColor: v ?? "brand:primaryForeground" })
          }
        />
        <AlignField
          label={t("field.textAlignment")}
          value={s.contentAlignment ?? "center"}
          onChange={(contentAlignment) => set.style({ contentAlignment })}
        />
        <Segmented<"top" | "center" | "bottom">
          label={t("field.textPosition")}
          value={s.verticalAlignment ?? "bottom"}
          onChange={(verticalAlignment) => set.style({ verticalAlignment })}
          options={[
            ["top", t("option.top")],
            ["center", t("option.middle")],
            ["bottom", t("option.bottom")],
          ]}
        />
      </Section>
    </>
  );
}

function CardSettings({ block }: { block: CardBlock }) {
  const set = useSetters(block);
  const t = useTranslations("studio.emailEditor.settings");
  const { data: d, style: s } = block;
  return (
    <>
      <Section title={t("section.card")}>
        <TextField
          label={t("field.title")}
          value={d.heading}
          onChange={(heading) => set.data({ heading })}
        />
        <TextAreaField
          label={t("field.text")}
          value={d.body}
          onChange={(body) => set.data({ body })}
        />
        <ToggleField
          label={t("field.emojiOnTop")}
          checked={d.showIcon}
          onChange={(showIcon) => set.data({ showIcon, iconMode: "emoji" })}
        />
        {d.showIcon && (
          <TextField
            label={t("field.emoji")}
            value={d.iconEmoji}
            onChange={(iconEmoji) =>
              set.data({ iconEmoji: iconEmoji.slice(0, 4), iconMode: "emoji" })
            }
          />
        )}
        <ToggleField
          label={t("field.badge")}
          checked={d.showBadge}
          onChange={(showBadge) => set.data({ showBadge })}
        />
        {d.showBadge && (
          <TextField
            label={t("field.badgeText")}
            value={d.badgeText}
            onChange={(badgeText) => set.data({ badgeText })}
          />
        )}
        <ToggleField
          label={t("field.button")}
          checked={d.showButton}
          onChange={(showButton) => set.data({ showButton })}
        />
        {d.showButton && (
          <>
            <TextField
              label={t("field.buttonLabel")}
              value={d.buttonText}
              onChange={(buttonText) => set.data({ buttonText })}
            />
            <LinkField
              label={t("field.buttonLink")}
              value={d.buttonUrl}
              onChange={(buttonUrl) => set.data({ buttonUrl })}
            />
          </>
        )}
      </Section>
      <Section title={t("section.style")}>
        <ColorField
          label={t("field.cardColour")}
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <NumberField
          label={t("field.cornerRadius")}
          min={0}
          max={32}
          value={s.borderRadius ?? 12}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
        <NumberField
          label={t("field.border")}
          min={0}
          max={4}
          value={s.borderWidth ?? 0}
          onChange={(borderWidth) => set.style({ borderWidth })}
        />
        {(s.borderWidth ?? 0) > 0 && (
          <ColorField
            label={t("field.borderColour")}
            value={s.borderColor}
            onChange={(v) => set.style({ borderColor: v ?? "brand:border" })}
          />
        )}
        <FontField
          label={t("field.titleFont")}
          value={s.headingFontFamily}
          onChange={(headingFontFamily) => set.style({ headingFontFamily })}
        />
        <ColorField
          label={t("field.titleColour")}
          value={s.headingColor}
          onChange={(v) => set.style({ headingColor: v ?? "brand:foreground" })}
        />
        <ColorField
          label={t("field.textColour")}
          value={s.bodyColor}
          onChange={(v) => set.style({ bodyColor: v ?? "brand:muted" })}
        />
        {d.showButton && (
          <>
            <ColorField
              label={t("field.buttonColour")}
              value={s.buttonBackgroundColor}
              onChange={(v) =>
                set.style({ buttonBackgroundColor: v ?? "brand:primary" })
              }
            />
            <ColorField
              label={t("field.buttonLabelColour")}
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
      <Section title={t("section.box")}>
        <SpacingField
          label={t("field.innerPadding")}
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function ListSettings({ block }: { block: ListBlock }) {
  const set = useSetters(block);
  const t = useTranslations("studio.emailEditor.settings");
  const { data: d, style: s } = block;
  const items = d.items;
  const setItems = (next: ListBlock["data"]["items"]) =>
    set.data({ items: next });
  return (
    <>
      <Section title={t("section.items")}>
        {items.map((item, i) => (
          <div key={item.id} className="space-y-1.5 rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <input
                aria-label={t("aria.bullet")}
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
                aria-label={t("aria.itemText")}
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
                aria-label={t("aria.itemDetail")}
                value={item.subtitle}
                placeholder={t("placeholder.itemDetail")}
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
                aria-label={t("aria.moveItemUp")}
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
                aria-label={t("aria.moveItemDown")}
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
                aria-label={t("aria.removeItem")}
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
          <Plus /> {t("action.addItem")}
        </Button>
      </Section>
      <Section title={t("section.style")}>
        <ColorField
          label={t("field.bulletColour")}
          value={s.iconColor}
          onChange={(v) => set.style({ iconColor: v ?? "brand:primary" })}
        />
        <ColorField
          label={t("field.textColour")}
          value={s.textColor}
          onChange={(v) => set.style({ textColor: v ?? "brand:foreground" })}
        />
        <FontField
          value={s.textFontFamily}
          onChange={(textFontFamily) => set.style({ textFontFamily })}
        />
        <NumberField
          label={t("field.textSize")}
          min={11}
          max={24}
          value={s.textFontSize ?? 15}
          onChange={(textFontSize) => set.style({ textFontSize })}
        />
        <Segmented<"vertical" | "horizontal">
          label={t("field.layout")}
          value={s.layout ?? "vertical"}
          onChange={(layout) => set.style({ layout })}
          options={[
            ["vertical", t("option.stacked")],
            ["horizontal", t("option.inARow")],
          ]}
        />
        <NumberField
          label={t("field.spaceBetween")}
          min={0}
          max={32}
          value={s.spacing ?? 12}
          onChange={(spacing) => set.style({ spacing })}
        />
      </Section>
      <Section title={t("section.box")}>
        <ColorField
          label={t("field.background")}
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
  const t = useTranslations("studio.emailEditor.settings");
  const { data: d, style: s } = block;
  return (
    <>
      <Section title={t("section.profile")}>
        <ImageField
          label={t("field.photo")}
          value={d.imageSrc}
          onPick={(imageSrc, alt) =>
            set.data({ imageSrc, imageAlt: alt || d.imageAlt })
          }
          onClear={() => set.data({ imageSrc: "" })}
        />
        <TextField
          label={t("field.name")}
          value={d.name}
          onChange={(name) => set.data({ name })}
        />
        <TextField
          label={t("field.role")}
          value={d.role}
          onChange={(role) => set.data({ role })}
        />
        <TextAreaField
          label={t("field.bio")}
          value={d.bio}
          onChange={(bio) => set.data({ bio })}
        />
        <ToggleField
          label={t("field.badge")}
          checked={d.showBadge}
          onChange={(showBadge) => set.data({ showBadge })}
        />
        {d.showBadge && (
          <TextField
            label={t("field.badgeText")}
            value={d.badgeText}
            onChange={(badgeText) => set.data({ badgeText })}
          />
        )}
      </Section>
      <Section title={t("section.style")}>
        <Segmented<"left" | "right" | "top">
          label={t("field.photoPosition")}
          value={s.imagePosition ?? "left"}
          onChange={(imagePosition) => set.style({ imagePosition })}
          options={[
            ["left", t("option.left")],
            ["top", t("option.top")],
            ["right", t("option.right")],
          ]}
        />
        <NumberField
          label={t("field.photoSize")}
          min={40}
          max={160}
          value={s.imageSize ?? 72}
          onChange={(imageSize) => set.style({ imageSize })}
        />
        <ColorField
          label={t("field.cardColour")}
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <ColorField
          label={t("field.nameColour")}
          value={s.nameColor}
          onChange={(v) => set.style({ nameColor: v ?? "brand:foreground" })}
        />
        <ColorField
          label={t("field.roleColour")}
          value={s.roleColor}
          onChange={(v) => set.style({ roleColor: v ?? "brand:primary" })}
        />
        <ColorField
          label={t("field.bioColour")}
          value={s.bioColor}
          onChange={(v) => set.style({ bioColor: v ?? "brand:muted" })}
        />
        <NumberField
          label={t("field.cornerRadius")}
          min={0}
          max={32}
          value={s.borderRadius ?? 12}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
      </Section>
      <Section title={t("section.box")}>
        <SpacingField
          label={t("field.innerPadding")}
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}

function BrandHeaderSettings({ block }: { block: BrandHeaderBlock }) {
  const set = useSetters(block);
  const t = useTranslations("studio.emailEditor.settings");
  const { data: d, style: s } = block;
  return (
    <>
      <Section title={t("section.brandHeader")}>
        <p className="text-sm text-muted-foreground">{t("hint.brandHeader")}</p>
        <SelectField<BrandHeaderBlock["data"]["variant"]>
          label={t("field.show")}
          value={d.variant}
          onChange={(variant) => set.data({ variant })}
          options={[
            ["logo", t("option.logo")],
            ["logoName", t("option.logoAndName")],
            ["mark", t("option.squareMark")],
            ["name", t("option.nameOnly")],
          ]}
        />
        {d.variant !== "name" && (
          <NumberField
            label={t("field.logoHeight")}
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
            label={t("field.nameColour")}
            value={s.color}
            onChange={(color) =>
              set.style({ color: color ?? "brand:foreground" })
            }
          />
        )}
      </Section>
      <Section title={t("section.box")}>
        <ColorField
          label={t("field.background")}
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
  const t = useTranslations("studio.emailEditor.settings");
  const { kit } = useEmailEditor();
  const { data: d, style: s } = block;
  return (
    <>
      <Section title={t("section.brandFooter")}>
        <p className="text-sm text-muted-foreground">{t("hint.brandFooter")}</p>
        <ToggleField
          label={t("field.socialProfiles")}
          checked={d.showSocial}
          onChange={(showSocial) => set.data({ showSocial })}
        />
        <ToggleField
          label={t("field.address")}
          checked={d.showAddress}
          onChange={(showAddress) => set.data({ showAddress })}
        />
        {d.showAddress && !kit.address && (
          <p className="text-xs text-muted-foreground">
            {t("hint.addressMissing")}
          </p>
        )}
        <TextAreaField
          label={t("field.note")}
          rows={2}
          value={d.note}
          placeholder={t("placeholder.footerNote")}
          onChange={(note) => set.data({ note })}
        />
      </Section>
      <Section title={t("section.style")}>
        <ColorField
          label={t("field.textColour")}
          value={s.color}
          onChange={(color) => set.style({ color: color ?? "brand:muted" })}
        />
        <NumberField
          label={t("field.textSize")}
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
          label={t("field.background")}
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

// The catalog's kinds, each worded as a message (settings.kind.<name>).
const KIND_NAMES = {
  course: "course",
  live: "live",
  stream: "stream",
  zoom: "zoom",
  onsite: "onsite",
  event: "event",
  download: "download",
  post: "post",
  plan: "plan",
  page: "page",
  subscription: "subscription",
  "blog post": "blogPost",
} as const;

function ItemSettings({ block }: { block: ItemBlock }) {
  const set = useSetters(block);
  const t = useTranslations("studio.emailEditor.settings");
  const store = useEmailEditor();
  const { data: d, style: s } = block;
  const current = store.items.find((i) => i.ref === d.ref);
  const kindLabel = (kind: string) =>
    kind in KIND_NAMES
      ? t(`kind.${KIND_NAMES[kind as keyof typeof KIND_NAMES]}`)
      : kind;
  const options: [string, string][] = [
    ["", t("option.chooseFeature")],
    ...store.items.map(
      (i) =>
        [
          i.ref,
          t("option.itemOf", { kind: kindLabel(i.kind), title: i.title }),
        ] as [string, string],
    ),
  ];
  if (d.ref && !current) options.push([d.ref, t("option.unavailable")]);
  return (
    <>
      <Section title={t("section.featuredItem")}>
        <SelectField
          label={t("field.feature")}
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
            {t("action.browseOffers")}
          </Button>
        )}
        {current && (
          <p className="text-xs text-muted-foreground">
            {current.meta ? t("hint.itemFreshWithMeta") : t("hint.itemFresh")}
          </p>
        )}
        <Segmented<ItemBlock["data"]["layout"]>
          label={t("field.layout")}
          value={d.layout}
          onChange={(layout) => set.data({ layout })}
          options={[
            ["card", t("option.card")],
            ["row", t("option.row")],
            ["compact", t("option.compact")],
          ]}
        />
        {d.layout !== "compact" && (
          <>
            <ToggleField
              label={t("field.picture")}
              checked={d.showImage}
              onChange={(showImage) => set.data({ showImage })}
            />
            <ToggleField
              label={t("field.description")}
              checked={d.showSummary}
              onChange={(showSummary) => set.data({ showSummary })}
            />
          </>
        )}
        <ToggleField
          label={t("field.priceOrDate")}
          checked={d.showMeta}
          onChange={(showMeta) => set.data({ showMeta })}
        />
        {d.layout !== "compact" && (
          <TextField
            label={t("field.buttonLabel")}
            value={d.buttonText}
            placeholder={t("placeholder.noButton")}
            onChange={(buttonText) => set.data({ buttonText })}
          />
        )}
      </Section>
      <Section title={t("section.style")}>
        <ColorField
          label={t("field.cardColour")}
          allowNone
          value={s.backgroundColor}
          onChange={(backgroundColor) => set.style({ backgroundColor })}
        />
        <ColorField
          label={t("field.titleColour")}
          value={s.titleColor}
          onChange={(v) => set.style({ titleColor: v ?? "brand:foreground" })}
        />
        <ColorField
          label={t("field.textColour")}
          value={s.textColor}
          onChange={(v) => set.style({ textColor: v ?? "brand:muted" })}
        />
        <ColorField
          label={t("field.buttonColour")}
          value={s.buttonColor}
          onChange={(v) => set.style({ buttonColor: v ?? "brand:primary" })}
        />
        <ColorField
          label={t("field.buttonLabelColour")}
          value={s.buttonTextColor}
          onChange={(v) =>
            set.style({ buttonTextColor: v ?? "brand:primaryForeground" })
          }
        />
        <NumberField
          label={t("field.cornerRadius")}
          min={0}
          max={32}
          value={s.borderRadius ?? 12}
          onChange={(borderRadius) => set.style({ borderRadius })}
        />
      </Section>
      <Section title={t("section.box")}>
        <SpacingField
          value={s.padding}
          onChange={(padding) => set.style({ padding })}
        />
      </Section>
    </>
  );
}
