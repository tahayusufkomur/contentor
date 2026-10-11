/** Remembers, per browser, which setup demo hints the coach has already
 * learned from, so they play once and stay out of the way afterwards.
 * Storage can be missing or throw (private window): then the hint simply
 * shows again, never an error. */
const key = (name: string) => `sf-demo-seen:${name}`;

function store(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function demoSeen(
  name: string,
  s: Pick<Storage, "getItem"> | null = store(),
): boolean {
  try {
    return s?.getItem(key(name)) === "1";
  } catch {
    return false;
  }
}

export function markDemoSeen(
  name: string,
  s: Pick<Storage, "setItem"> | null = store(),
): void {
  try {
    s?.setItem(key(name), "1");
  } catch {
    /* storage unavailable: the hint just shows again next time */
  }
}
