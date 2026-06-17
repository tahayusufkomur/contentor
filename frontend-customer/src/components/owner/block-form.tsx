"use client";

import { FieldRenderer } from "./field-renderer";
import { StyleControls } from "./style-controls";
import { getBlockDef } from "@/lib/blocks/registry";
import type { Block } from "@/types/tenant";

interface BlockFormProps {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
}

export function BlockForm({ block, onChange }: BlockFormProps) {
  const def = getBlockDef(block.type);
  if (!def) {
    return (
      <p className="text-xs text-muted-foreground">
        This block type isn&apos;t editable here.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {def.fields.map((field) => {
        if (field.showWhen && !field.showWhen(block)) return null;
        return (
          <FieldRenderer
            key={field.key}
            field={field}
            value={block[field.key]}
            onChange={(value) => onChange({ [field.key]: value })}
          />
        );
      })}
      <StyleControls block={block} onChange={onChange} />
    </div>
  );
}
