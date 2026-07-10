// Assistant answers use a small markdown-lite contract shared with the live
// bubble ([label](/path) links, **bold**). The coach-facing surfaces in this
// admin page (preview chat, transcript list) just display the text — they
// don't need clickable links — so strip the markdown syntax rather than
// showing a non-technical coach raw `[label](/path)`/`**bold**` characters.
export function cleanAnswer(content: string): string {
  return content
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}
