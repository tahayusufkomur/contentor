// A change to the email open in her editor applies itself when the card
// arrives while she is there: she watches the email change in place, and the
// editor's Undo takes it back. A card from history, or one that arrived on
// another page, waits for her Confirm.

const live = new Set<string>();

/** The email editor: a draft's editor, or one of her templates. */
export const onEmailEditor = (path: string | null) =>
  /^\/admin\/messages\/email\/(\d+\/edit|templates\/\d+)\/?$/.test(path ?? "");

/** Note the edit_email cards of replies that just arrived in the editor. */
export function markLiveEdits(
  path: string | null,
  replies: { cards?: { token: string; kind: string }[] }[],
) {
  if (!onEmailEditor(path)) return;
  for (const reply of replies)
    for (const card of reply.cards ?? [])
      if (card.kind === "edit_email") live.add(card.token);
}

/** True once for a live card, and only while she is still in the editor. */
export const claimLiveEdit = (token: string, path: string | null) =>
  live.delete(token) && onEmailEditor(path);
