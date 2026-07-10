// Assistant answers use a small markdown-lite contract shared with the live
// chat widgets (`[label](/path)` links, `**bold**`) — see `AnswerBody` in
// setup/help-chat.tsx and shared/help-bubble.tsx. Those widgets don't just
// strip the syntax, they extract `{label, href}` pairs and render real
// clickable links so the reader can navigate. The coach-facing surfaces in
// this admin page (preview chat, transcript list) follow the same contract:
// parse the links out instead of discarding them, so a coach reading a
// transcript sees the same navigable link a student/visitor saw, not inert
// text like "See the FAQ page".
//
// The extraction regex below is a syntactic first pass only — it requires a
// single leading slash NOT immediately followed by another slash, which
// blocks the obvious `//evil.com` protocol-relative bypass. It is NOT the
// safety boundary: a second bypass survives it (`/\evil.com` — the WHATWG
// URL Standard treats a backslash right after the leading slash exactly
// like a second slash for http/https URLs, so real browsers resolve it to
// host `evil.com`), and a character-class regex can never rule out every
// such parser quirk. The actual safety boundary is `isSameOriginPath`
// below: every extracted href is resolved with the real `URL` parser (the
// same algorithm a browser uses to navigate) and kept only if the resolved
// origin matches the caller's origin.
const LINK_RE = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g;

export interface AnswerLink {
  label: string;
  href: string;
}

export interface ParsedAnswer {
  text: string;
  links: AnswerLink[];
}

/** Resolves `href` against `origin` using the real WHATWG `URL` parser (the
 * same algorithm a browser uses for navigation) and accepts it only if the
 * resolved origin matches exactly. `origin` is an explicit parameter rather
 * than read from `window.location` so this stays a pure, SSR-safe function
 * that's trivially unit-testable without a DOM. */
export function isSameOriginPath(href: string, origin: string): boolean {
  try {
    return new URL(href, origin).origin === origin;
  } catch {
    return false;
  }
}

/** Parses the markdown-lite answer contract: extracts `[label](/path)`
 * links as `{label, href}` pairs (dropped from the inline text, same as
 * `AnswerBody`) and strips `**bold**` markers, leaving plain text plus a
 * list of links for the caller to render as actual `<Link>`/`<a>` elements.
 * Every extracted href is validated against `origin` via `isSameOriginPath`
 * before being included in `links` — an href that resolves off-origin
 * (e.g. `//evil.com` or the backslash-bypass `/\evil.com`) is dropped
 * entirely, so it can never be rendered as a navigable element. Its
 * markdown is still stripped from `text`, same as any other matched link. */
export function parseAnswer(content: string, origin: string): ParsedAnswer {
  const links: AnswerLink[] = [];
  const text = content
    .replace(LINK_RE, (_match, label: string, href: string) => {
      if (isSameOriginPath(href, origin)) {
        links.push({ label, href });
      }
      return "";
    })
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
  return { text, links };
}

/** Renders a `system`-role thread message (produced by the takeover kernel —
 * see `apps/core/assistant.py::append_message` call sites) into a short
 * human sentence, or `null` for a token this UI doesn't render. Shared
 * between the student-facing widget (`SiteAssistantBubble`) and the coach's
 * `ConversationsCard` so the same three tokens read consistently on both
 * surfaces; `t` is whatever `useTranslations(...)` scope the caller already
 * has open (student.assistant.* or admin.assistant.*), so this stays a pure
 * function with no namespace of its own. */
export function systemLine(
  content: string,
  t: (key: string, values?: object) => string,
): string | null {
  if (content.startsWith("agent_joined:")) {
    return t("agentJoined", { name: content.slice("agent_joined:".length) });
  }
  if (content === "assistant_resumed") return t("assistantResumed");
  if (content === "human_requested") return t("humanRequestedLine");
  return null;
}
