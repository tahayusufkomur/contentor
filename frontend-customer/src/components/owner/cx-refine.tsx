"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { failureMessage, refineSection, withoutId } from "@/lib/cx/api";
import type { Block } from "@/types/tenant";

/** "Change with AI" for an AI-built section: the coach says what to change in
 *  plain words; their photos and untouched words survive. */
export function CxRefine({
  block,
  onChange,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const { run: apply, loading } = useAsyncAction(async () => {
    const res = await refineSection(block, instruction.trim());
    if (!res.block) {
      toast.error(failureMessage(res.source));
      return;
    }
    onChange(withoutId(res.block));
    setInstruction("");
  });
  const id = `cx-refine-${block.id}`;
  return (
    <div className="space-y-2 rounded-md border border-dashed p-2.5">
      <label htmlFor={id} className="text-xs font-medium">
        Change with AI
      </label>
      <Textarea
        id={id}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={2}
        maxLength={600}
        placeholder="Make it two columns and add a short intro"
        className="text-xs"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        loading={loading}
        loadingText="Changing…"
        disabled={instruction.trim().length < 3}
        onClick={() => apply()}
      >
        Apply change
      </Button>
    </div>
  );
}
