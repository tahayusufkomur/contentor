// Focus mode: she and a copy run both write the same record's text fields. Each
// field of the form remembers the copy it was last GIVEN (the saved record, or
// a value the run's replay typed in). A field that differs from that is hers
// (typed, and maybe saved: a save does not move it), and the run never takes
// it over. The message composer and the class and event form share these rules.

/** How the server keeps each field (it trims a title): what `isHers` compares. */
export type Tidy<K extends string> = Record<K, (value: string) => string>;

export function ownership<K extends string>(tidy: Tidy<K>) {
  const fields = Object.keys(tidy) as K[];

  /** She changed this field since `was`, the copy it was last given (the form
   *  holds it as typed, the server tidies it). */
  const isHers = (field: K, mine: string, was: string) =>
    tidy[field](mine) !== was;

  /** The run is typing this field in and it is not hers: read-only until it is
   *  done. A field she changed first is never taken over (her keys land, the
   *  run's typing is not shown over it). */
  const isWriting = (field: K, typing: boolean, mine: string, was: string) =>
    typing && !isHers(field, mine, was);

  /** A newer copy (`next`) laid over the form: each field takes the copy's
   *  value unless she changed it since `was`, or the copy has nothing new for
   *  it (what she is typing is left as typed). Returns the form after, and the
   *  copy the form now stands on (`was` for the fields it did not take). */
  function layOver(
    mine: Record<K, string>,
    was: Record<K, string>,
    next: Record<K, string>,
  ) {
    const form = { ...mine };
    const placed = { ...was };
    for (const field of fields)
      if (
        next[field] !== was[field] &&
        !isHers(field, mine[field], was[field])
      ) {
        form[field] = next[field];
        placed[field] = next[field];
      }
    return { form, placed };
  }

  return { isHers, isWriting, layOver };
}

/** A class's or event's title (trimmed by the server) and description. */
export const EVENT_TIDY = {
  title: (value: string) => value.trim(),
  description: (value: string) => value,
};
export const eventOwn = ownership(EVENT_TIDY);
