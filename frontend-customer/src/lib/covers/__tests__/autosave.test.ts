import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "@/lib/covers/autosave";
import { defaultRecipe } from "@/lib/covers/recipe";
import type { CoverRecipe } from "@/types/design";

const recipe = (title: string): CoverRecipe => ({
  ...defaultRecipe(),
  words: { label: "", title, subtitle: "" },
});

/** A save the test settles by hand. */
function slowSave() {
  const calls: { recipe: CoverRecipe; done: () => void; fail: () => void }[] =
    [];
  const save = vi.fn(
    (r: CoverRecipe) =>
      new Promise<void>((resolve, reject) => {
        calls.push({
          recipe: r,
          done: resolve,
          fail: () => reject(new Error("offline")),
        });
      }),
  );
  return { save, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosave", () => {
  it("saves once, with the last recipe, after three edits inside 800 ms", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    await vi.advanceTimersByTimeAsync(300);
    autosave.schedule(recipe("b"));
    await vi.advanceTimersByTimeAsync(300);
    autosave.schedule(recipe("c"));
    // 800 ms count from the last edit, not the first
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(recipe("c"));
  });

  it("flush saves the pending recipe at once, and the timer does not save it again", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(recipe("a"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending saves nothing", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosave(save);
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("cancel drops the pending recipe, for the timer and for flush", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    autosave.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps the recipe pending when a save fails, for the next flush", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    // the timer's save fails quietly: the caller's save already said so
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(recipe("a"));
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("flush rejects with the save's error, so a caller can stop", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    await expect(autosave.flush()).rejects.toThrow("offline");
  });

  it("saves a newer edit, not the one that failed, once she has made one", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    await vi.advanceTimersByTimeAsync(800);
    autosave.schedule(recipe("b"));
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(recipe("b"));
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does not bring back a recipe that was cancelled while its save was on the way", async () => {
    const { save, calls } = slowSave();
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    await vi.advanceTimersByTimeAsync(800);
    autosave.cancel();
    calls[0].fail();
    await vi.advanceTimersByTimeAsync(0);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never has two saves on the way: a later one waits for the earlier", async () => {
    const { save, calls } = slowSave();
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(1);

    autosave.schedule(recipe("b"));
    const flushed = autosave.flush();
    await vi.advanceTimersByTimeAsync(2000);
    // "a" has not landed: "b" is not sent yet
    expect(calls).toHaveLength(1);

    calls[0].done();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].recipe).toEqual(recipe("b"));

    let landed = false;
    void flushed.then(() => {
      landed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(landed).toBe(false);
    calls[1].done();
    await flushed;
    expect(landed).toBe(true);
  });

  it("flush waits for a save already on the way, even with nothing new pending", async () => {
    const { save, calls } = slowSave();
    const autosave = createAutosave(save);
    autosave.schedule(recipe("a"));
    await vi.advanceTimersByTimeAsync(800);

    let landed = false;
    void autosave.flush().then(() => {
      landed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(landed).toBe(false);
    calls[0].done();
    await vi.advanceTimersByTimeAsync(0);
    expect(landed).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
