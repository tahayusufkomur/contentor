"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useAsyncAction } from "@shared/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import {
  fileProblem,
  SHARE_ACCEPT,
  shareErrorText,
  type ShareDoc,
} from "@/lib/share-doc";

/** A quiet way to hand over a bio, CV or old About page instead of answering
 * question by question: a file or pasted text, read as one turn that fills
 * what it can. Failures show here, in place; success replaces the screen. */
export function SharePanel({
  onShare,
  disabled,
}: {
  onShare: (doc: ShareDoc) => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const { run, loading } = useAsyncAction(
    async () => {
      setError("");
      await onShare(file ? { file } : { text });
    },
    { onError: (err) => setError(shareErrorText(err)) },
  );

  if (!open)
    return (
      <p className="mt-4 text-[13.5px] text-[var(--sf-graphite)]">
        Have a bio, CV or an old About page?{" "}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="font-medium underline underline-offset-2 hover:text-[var(--sf-ink)] disabled:opacity-50"
        >
          Add it and I&rsquo;ll fill in what I can.
        </button>
      </p>
    );

  const pick = (picked: File | null) => {
    const problem = picked ? fileProblem(picked) : null;
    setError(problem ?? "");
    setFile(problem ? null : picked);
    if (problem && input.current) input.current.value = "";
  };

  return (
    <form
      className="mt-4 flex max-w-[720px] flex-col gap-3 rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-paper)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (file || text.trim()) void run();
      }}
    >
      <p className="text-[14px] text-[var(--sf-graphite)]">
        Add a PDF, text or Markdown file (up to 5 MB), or paste the text. I read
        it once, fill in what it answers, and leave anything you have already
        answered alone.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={SHARE_ACCEPT}
          aria-label="Choose a file"
          disabled={disabled || loading}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="sr-only"
          id="setup-share-file"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || loading}
          onClick={() => input.current?.click()}
          className="rounded-full"
        >
          <FileText className="size-4" aria-hidden />
          {file ? "Choose another file" : "Choose a file"}
        </Button>
        {file && (
          <span className="truncate text-[13.5px] text-[var(--sf-ink)]">
            {file.name}
          </span>
        )}
      </div>
      {!file && (
        <textarea
          aria-label="Or paste text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled || loading}
          rows={4}
          maxLength={20000}
          placeholder="Or paste text here, like the About page of your old site"
          className="block w-full resize-y rounded-xl border border-[var(--sf-line-strong)] bg-white px-3 py-2.5 text-[15px] leading-relaxed outline-none transition-[border-color,box-shadow] focus:border-[var(--sf-ink)] focus:shadow-[0_0_0_3px_var(--sf-brass-soft)] disabled:opacity-50"
        />
      )}
      {error && (
        <p role="alert" className="text-[13.5px] text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          loading={loading}
          loadingText="Reading your file…"
          disabled={disabled || (!file && !text.trim())}
          className="rounded-full px-5"
        >
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => {
            setOpen(false);
            setFile(null);
            setText("");
            setError("");
          }}
          className="rounded-full text-[var(--sf-graphite)]"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
