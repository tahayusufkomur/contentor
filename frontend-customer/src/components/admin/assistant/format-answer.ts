// Assistant answers use a small markdown-lite contract shared with the live
// chat widgets (`[label](/path)` links, `**bold**`) — see `AnswerBody` in
// setup/help-chat.tsx and shared/help-bubble.tsx. Those widgets don't just
// strip the syntax, they extract `{label, href}` pairs and render real
// clickable links so the reader can navigate. The coach-facing surfaces in
// this admin page (preview chat, transcript list) follow the same contract:
// parse the links out instead of discarding them, so a coach reading a
// transcript sees the same navigable link a student/visitor saw, not inert
// text like "See the FAQ page".
const LINK_RE = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;

export interface AnswerLink {
  label: string;
  href: string;
}

export interface ParsedAnswer {
  text: string;
  links: AnswerLink[];
}

/** Parses the markdown-lite answer contract: extracts `[label](/path)`
 * links as `{label, href}` pairs (dropped from the inline text, same as
 * `AnswerBody`) and strips `**bold**` markers, leaving plain text plus a
 * list of links for the caller to render as actual `<Link>`/`<a>` elements. */
export function parseAnswer(content: string): ParsedAnswer {
  const links: AnswerLink[] = [];
  const text = content
    .replace(LINK_RE, (_match, label: string, href: string) => {
      links.push({ label, href });
      return "";
    })
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
  return { text, links };
}
