// The studio's autosave: a draft is saved 800 ms after she stops editing, and at once when a caller needs
// it on the server (Keep, leaving the page). It knows nothing of React or of the API: the editor gives it the
// function that saves, and that function says what a failure looks like on screen.

import type { CoverRecipe } from "@/types/design";

export interface Autosave {
  /** Saves `recipe` after `delay` ms without another call; a newer recipe before then takes its place. */
  schedule(recipe: CoverRecipe): void;
  /** Saves what is pending now, and resolves once every save so far has landed. Rejects with the save's
   *  error, the recipe still pending, so a caller about to go on (Keep) can stop. */
  flush(): Promise<void>;
  /** Forgets what is pending (the draft is going away). A save already sent still lands. */
  cancel(): void;
}

export function createAutosave(
  save: (recipe: CoverRecipe) => Promise<void>,
  delay = 800,
): Autosave {
  let pending: CoverRecipe | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Bumped by cancel: a save that fails after it must not bring its recipe back.
  let epoch = 0;
  // One save at a time, in the order they were asked: with two on the way the older could land last and
  // leave the draft one edit behind.
  let tail: Promise<unknown> = Promise.resolve();

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const flush = (): Promise<void> => {
    stop();
    const job = tail.then(async () => {
      // Read when this turn comes: an edit made while an earlier save was on the way is the one to send.
      const recipe = pending;
      if (!recipe) return;
      pending = null;
      const sent = epoch;
      try {
        await save(recipe);
      } catch (error) {
        // Keep it for the next flush, unless a newer edit has taken its place or the draft was cancelled.
        if (sent === epoch) pending ??= recipe;
        throw error;
      }
    });
    // The chain goes on after a failure; the caller of flush still sees it.
    tail = job.catch(() => {});
    return job;
  };

  return {
    schedule(recipe) {
      pending = recipe;
      stop();
      // A failed save here has already been reported by `save`; the recipe waits for the next edit or flush.
      timer = setTimeout(() => void flush().catch(() => {}), delay);
    },
    flush,
    cancel() {
      stop();
      pending = null;
      epoch++;
    },
  };
}
