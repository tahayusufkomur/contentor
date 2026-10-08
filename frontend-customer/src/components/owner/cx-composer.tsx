"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mintBlockId } from "@/lib/blocks/registry";
import {
  type CxSaved,
  blockFromSaved,
  composeSection,
  failureMessage,
  listMySections,
} from "@/lib/cx/api";
import type { Block, PageKey } from "@/types/tenant";
import { useEditorStore } from "./canvas/editor-store";

/** "Describe a section": the AI builds a custom section in the site's style.
 *  The coach's earlier sections can be added again in one click. */
export function CxComposer({
  pageKey,
  onInserted,
}: {
  pageKey: PageKey;
  onInserted: () => void;
}) {
  const store = useEditorStore();
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState<CxSaved[]>([]);

  useEffect(() => {
    let alive = true;
    listMySections().then(
      (res) => {
        if (alive) setSaved(res.components);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  const insert = (block: Block) => {
    store.insertBlock(pageKey, block);
    store.selectBlock(block.id, { reveal: true });
    onInserted();
  };

  const { run: create, loading } = useAsyncAction(async () => {
    const res = await composeSection(prompt.trim(), pageKey);
    if (!res.block) {
      toast.error(failureMessage(res.source));
      return;
    }
    insert({ ...res.block, id: mintBlockId() });
    setPrompt("");
    if (res.missing.length) {
      toast.info(
        `Not possible yet: ${res.missing.join(", ")}. I built the closest thing.`,
      );
    }
  });

  return (
    <div className="space-y-2 rounded-md border border-dashed p-2.5">
      <label htmlFor="cx-prompt" className="text-xs font-medium">
        Describe a section
      </label>
      <Textarea
        id="cx-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        maxLength={600}
        placeholder="A day-by-day plan of my 5-day retreat, with a photo for each day"
        className="text-xs"
      />
      <Button
        type="button"
        size="sm"
        className="w-full"
        loading={loading}
        loadingText="Designing…"
        disabled={prompt.trim().length < 8}
        onClick={() => create()}
      >
        Create with AI
      </Button>
      {saved.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground">
            Your sections
          </p>
          {saved.map((section) => (
            <button
              key={section.ref}
              type="button"
              title={section.summary}
              onClick={() => insert(blockFromSaved(section, mintBlockId()))}
              className="block w-full truncate rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary hover:bg-primary/5"
            >
              {section.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
