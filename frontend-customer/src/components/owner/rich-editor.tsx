"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Bold, Italic, List, ListOrdered, Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModalPortal } from "@/components/ui/modal-portal";
import { LinkPickerModal } from "./link-picker";

interface OpenOptions {
  value: string;
  title?: string;
  onSave: (html: string) => void;
}

interface RichEditorContextValue {
  openRichEditor: (opts: OpenOptions) => void;
}

const RichEditorContext = createContext<RichEditorContextValue | null>(null);

/** Open the shared rich-text modal. Returns null outside the provider. */
export function useRichEditor(): RichEditorContextValue | null {
  return useContext(RichEditorContext);
}

/** Provides a single centered rich-text modal shared by the canvas (click a
 *  body to edit) and the sidebar form. */
export function RichEditorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<OpenOptions | null>(null);
  const openRichEditor = useCallback(
    (opts: OpenOptions) => setTarget(opts),
    [],
  );

  return (
    <RichEditorContext.Provider value={{ openRichEditor }}>
      {children}
      {target && (
        <RichTextModal
          initialValue={target.value}
          title={target.title}
          onSave={(html) => {
            target.onSave(html);
            setTarget(null);
          }}
          onClose={() => setTarget(null)}
        />
      )}
    </RichEditorContext.Provider>
  );
}

const toolBtn =
  "flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

function RichTextModal({
  initialValue,
  title,
  onSave,
  onClose,
}: {
  initialValue: string;
  title?: string;
  onSave: (html: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  // Seed the editor once (uncontrolled — execCommand mutates the DOM directly).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialValue || "";
    ref.current?.focus();
  }, [initialValue]);

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    ref.current?.focus();
  };
  const addLink = () => {
    // Remember the selection — opening the picker modal would otherwise lose it.
    const sel = window.getSelection();
    savedRange.current =
      sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    setLinkOpen(true);
  };
  const applyLink = (href: string) => {
    setLinkOpen(false);
    ref.current?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (savedRange.current && !savedRange.current.collapsed) {
      document.execCommand("createLink", false, href);
    } else {
      // No text selected — insert the link text. (Sanitized on save.)
      document.execCommand(
        "insertHTML",
        false,
        `<a href="${href}">${href}</a>`,
      );
    }
  };
  const save = () => onSave(ref.current?.innerHTML ?? "");

  return (
    <>
      <ModalPortal>
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <h2 className="text-sm font-semibold">{title || "Edit text"}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Toolbar — onMouseDown preventDefault keeps the editor selection. */}
            <div className="flex items-center gap-0.5 border-b px-3 py-2">
              <button
                type="button"
                className={toolBtn}
                title="Bold"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec("bold")}
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={toolBtn}
                title="Italic"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec("italic")}
              >
                <Italic className="h-4 w-4" />
              </button>
              <span className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                className={toolBtn}
                title="Bulleted list"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec("insertUnorderedList")}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={toolBtn}
                title="Numbered list"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec("insertOrderedList")}
              >
                <ListOrdered className="h-4 w-4" />
              </button>
              <span className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                className={toolBtn}
                title="Add link"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addLink}
              >
                <Link2 className="h-4 w-4" />
              </button>
            </div>

            <div
              ref={ref}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              onPaste={(e) => {
                // Plain-text paste — never trust pasted HTML (it's allowlist-sanitized
                // on save anyway, but this keeps the editor content clean).
                e.preventDefault();
                const text = e.clipboardData.getData("text/plain");
                document.execCommand("insertText", false, text);
              }}
              className={cn(
                "min-h-[16rem] flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed outline-none",
                "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-primary [&_a]:underline [&_p]:mb-3",
              )}
            />

            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
      {linkOpen && (
        <LinkPickerModal
          onPick={applyLink}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </>
  );
}
