/** A failed studio action: the creator sees `shown` (in their language), the
 *  original error goes to the console so a developer can still read it. */
export function studioFailure(
  context: string,
  err: unknown,
  shown: string,
): string {
  console.error(`logo studio: ${context}`, err);
  return shown;
}
