/** TipTap document JSON → the plain-markdown text the copilot backend
 * expects. The composer allows paragraphs, bold/italic, and bullet lists;
 * everything serializes to text the model (and the transcript) reads
 * naturally: paragraphs joined by blank lines, list items as "- " lines,
 * bold/italic as markdown markers. Pure so vitest can pin it. */

interface TipTapMark {
  type: string;
}

export interface TipTapNode {
  type?: string;
  text?: string;
  marks?: TipTapMark[];
  content?: TipTapNode[];
}

function inlineText(node: TipTapNode): string {
  if (node.type === "text") {
    let text = node.text ?? "";
    const marks = new Set((node.marks ?? []).map((m) => m.type));
    if (marks.has("bold")) text = `**${text}**`;
    if (marks.has("italic")) text = `*${text}*`;
    return text;
  }
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

function blockText(node: TipTapNode): string {
  if (node.type === "paragraph") return inlineText(node);
  if (node.type === "bulletList") {
    return (node.content ?? [])
      .map((item) => {
        // listItem content is paragraphs (possibly nested lists — flattened).
        const inner = (item.content ?? []).map(blockText).filter(Boolean);
        return inner
          .map((line, i) => (i === 0 ? `- ${line}` : `  ${line}`))
          .join("\n");
      })
      .join("\n");
  }
  return (node.content ?? []).map(blockText).filter(Boolean).join("\n");
}

export function docToMessage(doc: TipTapNode): string {
  const blocks = (doc.content ?? []).map(blockText).map((b) => b.trim());
  return blocks.filter(Boolean).join("\n\n").trim();
}
