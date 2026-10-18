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
  if (input.rest) return { field, rest: true };
  if (input.delegate) return { field, delegate: true };
  if (input.picked !== null) return { field, value: input.picked };
  const text = input.text.trim();
  return text ? { field, text } : null;
}
