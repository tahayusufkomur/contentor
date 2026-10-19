import type { AnswerBody, FocusQuestion } from "./api";

export interface GuideInput {
  /** The tile she tapped, by value. */
  picked: string | null;
  /** What she typed or said. */
  text: string;
  /** "You decide". */
  delegate: boolean;
  /** "Just draft it". */
  rest: boolean;
}

/** The request one tap or one typed answer sends; null when there is nothing
 *  to send yet. */
export function guideBody(
  question: FocusQuestion,
  input: GuideInput,
): AnswerBody | null {
  const field = question.field;
  const text = input.text.trim();
  // "Just draft it" with words in the box: they answer this question first.
  if (input.rest)
    return text ? { field, rest: true, text } : { field, rest: true };
  if (input.delegate) return { field, delegate: true };
  if (input.picked !== null) return { field, value: input.picked };
  return text ? { field, text } : null;
}

/** Past this many tiles, "Select all" sits above them, where she sees it. */
export const PICK_ALL_ABOVE = 8;

/** A pick question's tiles as she sees them: those ticked when it opened (the
 *  items her words named) first, the rest in their order. It depends only on
 *  what it opened with, so a tap never moves a tile. */
export function pickOrder<T extends { value: string }>(
  options: T[],
  ticked: string[],
): T[] {
  return [
    ...options.filter((option) => ticked.includes(option.value)),
    ...options.filter((option) => !ticked.includes(option.value)),
  ];
}

/** Whether "Select all" / "Deselect all" goes above the tiles. */
export function pickAllAbove(count: number): boolean {
  return count > PICK_ALL_ABOVE;
}

/** A pick question's one answer: the ticked values in tile order, joined by
 *  commas; `all` (the server's "every tile") once every tile is ticked. */
export function pickAnswer(
  values: string[],
  ticked: string[],
  all: string,
): string {
  const picked = values.filter((value) => ticked.includes(value));
  return picked.length > 0 && picked.length === values.length
    ? all
    : picked.join(",");
}
