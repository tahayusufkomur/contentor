"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  GripVertical,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useState } from "react";

import { cn } from "../../../lib/utils";
import {
  BrandFooterView,
  BrandHeaderView,
  ItemView,
} from "../blocks/brand-views";
import {
  ButtonView,
  DividerView,
  HeadingView,
  HtmlView,
  ImageView,
  SocialView,
  SpacerView,
} from "../blocks/basic-views";
import { blockLabel, frameCss, padCss } from "../blocks/helpers";
import {
  CardView,
  HeroView,
  ListView,
  ProfileView,
} from "../blocks/rich-views";
import { TextView } from "../blocks/text-view";
import { useEmailEditor } from "../store";
import { locateBlock, REGIONS, type ListLoc } from "../tree";
import type { Block, ColumnsBlock, RegionKey } from "../types";
import { DropZone, useBlockDrag, useCanvasRef } from "./dnd";

const REGION_LABELS: Record<RegionKey, string> = {
  header: "Header",
  body: "Body",
  footer: "Footer",
};

const EMPTY_HINTS: Record<RegionKey, string> = {
  header: "Your header: drop the brand header (logo) here",
  body: "Drag blocks here, or click one in the Add panel",
  footer: "Your footer: drop the brand footer here",
};

/** The email as she will see it, editable: her brand's backdrop, the body at
 *  its width, and the header / body / footer regions marked out. */
export function Canvas() {
  const store = useEmailEditor();
  const canvasRef = useCanvasRef();
  const s = store.resolved.settings;
  return (
    <div
      ref={canvasRef}
      className="min-h-full px-3 py-8 sm:px-6"
      style={{ backgroundColor: s.backgroundColor }}
      onClick={(e) => {
        if (e.target === e.currentTarget) store.select(null);
      }}
      onMouseLeave={() => store.hover(null)}
    >
      <div
        className="mx-auto shadow-sm"
        style={{
          width: "100%",
          maxWidth: s.contentWidth || 600,
          backgroundColor: s.bodyBackgroundColor,
          borderRadius: s.bodyBorderRadius || undefined,
          overflow: s.bodyBorderRadius ? "hidden" : undefined,
          fontFamily: s.defaultFont,
          fontSize: s.defaultFontSize,
          color: s.defaultColor,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) store.select(null);
        }}
      >
        {REGIONS.map((region) => (
          <section
            key={region}
            aria-label={REGION_LABELS[region]}
            // Blocks stop their own mouseover: one that reaches here is off every block.
            onMouseOver={() => store.hover(null)}
          >
            <div className="pointer-events-none flex select-none items-center gap-2 px-2 pt-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.14em] text-[#9a9a9a]">
              <span className="h-px flex-1 border-t border-dashed border-[#c9c9c9]" />
              {REGION_LABELS[region]}
              <span className="h-px flex-1 border-t border-dashed border-[#c9c9c9]" />
            </div>
            <BlockList
              blocks={store.resolved[region].blocks}
              loc={{ region, parentId: null, columnId: null }}
              empty={EMPTY_HINTS[region]}
            />
          </section>
        ))}
      </div>
    </div>
  );
}

function BlockList({
  blocks,
  loc,
  empty,
}: {
  blocks: Block[];
  loc: ListLoc;
  empty: string;
}) {
  if (!blocks.length)
    return <DropZone target={{ ...loc, index: 0 }} empty={empty} />;
  return (
    <>
      <DropZone target={{ ...loc, index: 0 }} />
      {blocks.map((block, i) => (
        <Fragment key={block.id}>
          <BlockShell block={block} region={loc.region} />
          <DropZone target={{ ...loc, index: i + 1 }} />
        </Fragment>
      ))}
    </>
  );
}

const toolBtn =
  "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

function BlockShell({ block, region }: { block: Block; region: RegionKey }) {
  const store = useEmailEditor();
  const label = blockLabel(block.type);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } =
    useBlockDrag(block, label);
  const selected = store.selectedId === block.id;
  const hovered = store.hoveredId === block.id;
  return (
    <div
      ref={setNodeRef}
      data-block-id={block.id}
      className={cn(
        "relative",
        isDragging && "opacity-40",
        selected
          ? "z-10 outline outline-2 -outline-offset-2 outline-primary"
          : hovered && "outline outline-1 -outline-offset-1 outline-primary/60",
      )}
      // The innermost block under the pointer is the hovered one.
      onMouseOver={(e) => {
        e.stopPropagation();
        store.hover(block.id);
      }}
      // Links in the email never navigate while editing.
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("a")) e.preventDefault();
      }}
      onClick={(e) => {
        e.stopPropagation();
        store.select(block.id);
      }}
    >
      {(selected || hovered) && (
        <BlockToolbar
          block={block}
          label={label}
          dragRef={setActivatorNodeRef}
          dragProps={{ ...attributes, ...listeners }}
        />
      )}
      <div style={frameCss(block)}>
        <BlockView block={block} selected={selected} region={region} />
      </div>
    </div>
  );
}

function BlockToolbar({
  block,
  label,
  dragRef,
  dragProps,
}: {
  block: Block;
  label: string;
  dragRef: (el: HTMLElement | null) => void;
  dragProps: Record<string, unknown>;
}) {
  const store = useEmailEditor();
  const [confirming, setConfirming] = useState(false);
  const at = locateBlock(store.design, block.id);
  return (
    <div
      data-block-toolbar="true"
      className="absolute right-1 top-1 z-30 flex items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 font-sans text-foreground shadow-md backdrop-blur"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={dragRef}
        {...dragProps}
        type="button"
        className={cn(toolBtn, "cursor-grab active:cursor-grabbing")}
        title="Drag to move"
        aria-label={`Move ${label} block`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="px-1 text-xs font-medium">{label}</span>
      <button
        type="button"
        className={toolBtn}
        title="Move up"
        aria-label="Move up"
        disabled={!at || at.index === 0}
        onClick={() => store.moveBy(block.id, -1)}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={toolBtn}
        title="Move down"
        aria-label="Move down"
        disabled={!at || at.index >= at.size - 1}
        onClick={() => store.moveBy(block.id, 1)}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={toolBtn}
        title="Duplicate"
        aria-label="Duplicate"
        onClick={() => store.duplicate(block.id)}
      >
        <Copy className="h-4 w-4" />
      </button>
      {confirming ? (
        <>
          <button
            type="button"
            className={cn(
              toolBtn,
              "text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
            title="Delete this block"
            aria-label="Confirm delete"
            onClick={() => store.remove(block.id)}
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={toolBtn}
            title="Keep it"
            aria-label="Cancel delete"
            onClick={() => setConfirming(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={cn(
            toolBtn,
            "hover:bg-destructive/10 hover:text-destructive",
          )}
          title="Delete"
          aria-label="Delete"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ColumnsView({
  block,
  region,
}: {
  block: ColumnsBlock;
  region: RegionKey;
}) {
  const s = block.style;
  const columns = block.data.columns;
  const ratios = block.data.columnRatio ?? [];
  const align =
    s.verticalAlignment === "center"
      ? "center"
      : s.verticalAlignment === "bottom"
        ? "flex-end"
        : "flex-start";
  return (
    <div
      style={{
        display: "flex",
        gap: s.gap ?? 10,
        alignItems: align,
        minHeight: s.minHeight || undefined,
      }}
    >
      {columns.map((col, i) => (
        <div
          key={col.id}
          style={{
            flex: `${ratios[i] || 1} 1 0`,
            minWidth: 0,
            alignSelf: s.minHeight ? "stretch" : undefined,
            display: "flex",
            flexDirection: "column",
            justifyContent: align,
            backgroundColor: col.backgroundColor ?? undefined,
            padding: col.padding ? padCss(col.padding) : undefined,
            borderRadius: col.borderRadius || undefined,
            backgroundImage: col.backgroundImage
              ? `url(${col.backgroundImage})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <BlockList
            blocks={col.blocks}
            loc={{ region, parentId: block.id, columnId: col.id }}
            empty={`Column ${i + 1}: drop a block`}
          />
        </div>
      ))}
    </div>
  );
}

function BlockView({
  block,
  selected,
  region,
}: {
  block: Block;
  selected: boolean;
  region: RegionKey;
}) {
  switch (block.type) {
    case "text":
      return <TextView block={block} selected={selected} />;
    case "heading":
      return <HeadingView block={block} />;
    case "button":
      return <ButtonView block={block} />;
    case "image":
      return <ImageView block={block} />;
    case "divider":
      return <DividerView block={block} />;
    case "spacer":
      return <SpacerView block={block} />;
    case "columns":
      return <ColumnsView block={block} region={region} />;
    case "social":
      return <SocialView block={block} />;
    case "hero":
      return <HeroView block={block} />;
    case "card":
      return <CardView block={block} />;
    case "list":
      return <ListView block={block} />;
    case "profile":
      return <ProfileView block={block} />;
    case "html":
      return <HtmlView block={block} />;
    case "brandHeader":
      return <BrandHeaderView block={block} />;
    case "brandFooter":
      return <BrandFooterView block={block} />;
    case "item":
      return <ItemView block={block} />;
    default:
      return null;
  }
}
