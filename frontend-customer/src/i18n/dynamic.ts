// next-intl checks every key against the English JSON. A key built at run time
// (`status.${status}`) can't be checked, so the cast is made here, visibly and
// per call, rather than loosening the types for everyone.

/** The key `key`, typed as one of the translator `t`'s keys. */
export function dyn<T extends (key: never, ...rest: never[]) => unknown>(
  _t: T,
  key: string,
): Parameters<T>[0] {
  return key as Parameters<T>[0];
}

/** `t` as a plain `(key: string) => string`, for helpers that build their own keys. */
export function looseT(
  t: (key: never, ...rest: never[]) => string,
): (key: string) => string {
  return (key) => t(key as never);
}
