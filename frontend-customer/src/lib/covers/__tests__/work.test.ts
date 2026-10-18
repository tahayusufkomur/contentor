import { describe, expect, it, vi } from "vitest";
import { countWork, isWorking, whileBusy } from "@/lib/covers/work";

describe("countWork", () => {
  it("counts the photos on their way, by where they come from", () => {
    let working = countWork({}, "photos", true);
    working = countWork(working, "photos", true);
    working = countWork(working, "uploads", true);
    expect(working).toEqual({ photos: 2, uploads: 1 });
    // one of two photos ending leaves the other on its way
    working = countWork(working, "photos", false);
    expect(isWorking(working, "photos")).toBe(true);
    working = countWork(working, "photos", false);
    expect(isWorking(working, "photos")).toBe(false);
    expect(isWorking(working, "uploads")).toBe(true);
  });

  it("never goes below none, and leaves the object alone when nothing changes", () => {
    const none = {};
    expect(countWork(none, "photos", false)).toBe(none);
    const one = countWork(none, "photos", true);
    expect(countWork(countWork(one, "photos", false), "photos", false)).toEqual(
      { photos: 0 },
    );
  });

  it("does not write to the object it was given", () => {
    const before = Object.freeze({ photos: 1 });
    expect(countWork(before, "uploads", true)).toEqual({
      photos: 1,
      uploads: 1,
    });
    expect(before).toEqual({ photos: 1 });
  });
});

describe("isWorking", () => {
  it("asks about one kind, or about any", () => {
    expect(isWorking({}, "photos")).toBe(false);
    expect(isWorking({}, undefined)).toBe(false);
    expect(isWorking({ photos: 0, uploads: 0 }, undefined)).toBe(false);
    expect(isWorking({ photos: 0, uploads: 2 }, undefined)).toBe(true);
    expect(isWorking({ photos: 0, uploads: 2 }, "photos")).toBe(false);
  });
});

describe("whileBusy", () => {
  /** A piece of work the test settles by hand. */
  function pending<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("says busy when the work starts and not busy only once it has ended", async () => {
    const onBusy = vi.fn();
    const job = pending<string>();
    const done = whileBusy(onBusy, () => job.promise);
    expect(onBusy.mock.calls).toEqual([[true]]);
    // time passes, and whatever else happens meanwhile (the drawer is left): nothing lifts it
    await Promise.resolve();
    await Promise.resolve();
    expect(onBusy.mock.calls).toEqual([[true]]);
    job.resolve("photo");
    await expect(done).resolves.toBe("photo");
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("lifts it when the work fails, and lets the failure through", async () => {
    const onBusy = vi.fn();
    const job = pending<string>();
    const done = whileBusy(onBusy, () => job.promise);
    job.reject(new Error("upload failed"));
    await expect(done).rejects.toThrow("upload failed");
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("lifts it when the work throws before it awaits anything", async () => {
    const onBusy = vi.fn();
    await expect(
      whileBusy(onBusy, () => {
        throw new Error("no file");
      }),
    ).rejects.toThrow("no file");
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("runs the work all the same when nobody listens", async () => {
    await expect(whileBusy(undefined, async () => 7)).resolves.toBe(7);
  });
});
