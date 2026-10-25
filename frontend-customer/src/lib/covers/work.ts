// Photos on their way to a cover (an upload, a copy from the library, a new photo) hold Keep and Discard: a
// photo that lands on a cover that has been kept or thrown away would be lost.
//
// The work itself reports (`whileBusy`): busy when it starts, and in a `finally` not busy once it has ended.
// A drawer must not do it from an effect, whose cleanup runs when she leaves the drawer while the work goes
// on. The editor counts the reports by where the photos come from.

/** Where a photo on its way comes from: the Photos drawer (her photos, the library, a new photo), the
 *  Uploads drawer, or the Edit photo drawer (a photo being changed). */
export type WorkKind = "photos" | "uploads" | "edits";

/** How many photos are on their way, by where they come from. */
export type Working = Readonly<Partial<Record<WorkKind, number>>>;

/** `working` after a photo of `kind` starts (`on`) or ends. Several can be on their way from one place:
 *  an upload and a new photo in the Photos drawer. */
export function countWork(
  working: Working,
  kind: WorkKind,
  on: boolean,
): Working {
  const now = working[kind] ?? 0;
  const next = Math.max(0, now + (on ? 1 : -1));
  return next === now ? working : { ...working, [kind]: next };
}

/** Whether a photo from `kind` is on its way, or from anywhere without a `kind`. */
export function isWorking(working: Working, kind?: WorkKind): boolean {
  return kind === undefined
    ? Object.values(working).some((n) => n > 0)
    : (working[kind] ?? 0) > 0;
}

/** Runs `work`, telling `onBusy` when it starts and, however it ends, when it has. */
export async function whileBusy<T>(
  onBusy: ((busy: boolean) => void) | undefined,
  work: () => Promise<T>,
): Promise<T> {
  onBusy?.(true);
  try {
    return await work();
  } finally {
    onBusy?.(false);
  }
}
