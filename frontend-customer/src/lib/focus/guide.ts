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
