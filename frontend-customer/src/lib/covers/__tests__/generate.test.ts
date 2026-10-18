import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePhoto } from "@/lib/covers/generate";
import {
  generationStatus,
  startGeneration,
  type GenerationJob,
} from "@/lib/curated-images-api";
import { ApiError } from "@/types/api";

vi.mock("@/lib/curated-images-api", () => ({
  startGeneration: vi.fn(),
  generationStatus: vi.fn(),
}));

const start = vi.mocked(startGeneration);
const status = vi.mocked(generationStatus);

const photo = { id: "p1", signed_url: "https://x/p1", title: "", alt_text: "" };
const job = (over: Partial<GenerationJob> = {}): GenerationJob => ({
  job_id: "j1",
  status: "running",
  done: false,
  photo: null,
  ...over,
});

/** A call the test settles by hand. */
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** What a makePhoto call came to, without ever leaving a rejection unhandled. */
const outcome = (call: Promise<unknown>) =>
  call.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );

beforeEach(() => {
  vi.useFakeTimers();
  start.mockReset();
  status.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("makePhoto", () => {
  it("starts the job at the aspect asked, then asks how it stands every 2 s until it is done", async () => {
    start.mockResolvedValue(job());
    status
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job({ done: true, photo }));
    const result = makePhoto("a porch at sunrise", "4:5");
    await vi.advanceTimersByTimeAsync(0);
    expect(start).toHaveBeenCalledWith("a porch at sunrise", "4:5");
    expect(status).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1999);
    expect(status).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(status).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith("j1");
    await vi.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(3);
    await expect(result).resolves.toEqual(photo);
    // done: nothing more is asked
    await vi.advanceTimersByTimeAsync(10_000);
    expect(status).toHaveBeenCalledTimes(3);
  });

  it("tells the caller when the job has started, so the allowance can be shown", async () => {
    start.mockResolvedValue(job({ done: true, photo }));
    const onStart = vi.fn();
    await makePhoto("x", "16:9", { onStart });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it("resolves null when the job ends without a photo", async () => {
    start.mockResolvedValue(job());
    status.mockResolvedValue(job({ status: "failed", done: true }));
    const result = makePhoto("x", "16:9");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBeNull();
  });

  it("rejects when the month's photos are used up, and asks about nothing", async () => {
    start.mockRejectedValue(new ApiError(429, { detail: "used up" }));
    await expect(makePhoto("x", "16:9")).rejects.toMatchObject({
      status: 429,
    });
    expect(status).not.toHaveBeenCalled();
  });

  it("carries on after one failed status call: the photo is already paid for", async () => {
    start.mockResolvedValue(job());
    status
      .mockRejectedValueOnce(new ApiError(503, { detail: "busy" }))
      .mockResolvedValue(job({ done: true, photo }));
    const result = makePhoto("x", "16:9");
    await vi.advanceTimersByTimeAsync(2000 + 800);
    await expect(result).resolves.toEqual(photo);
    expect(status).toHaveBeenCalledTimes(2);
  });

  it("stops asking when she leaves", async () => {
    start.mockResolvedValue(job());
    status.mockResolvedValue(job());
    const controller = new AbortController();
    const result = makePhoto("x", "16:9", { signal: controller.signal });
    const settled = result.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(status).toHaveBeenCalledTimes(1);
    await expect(settled).resolves.toBeInstanceOf(Error);
  });

  // The status call is a long poll (about 8 s), so most of the time she leaves with a call on its way.
  it("stops when she leaves while a status call is on its way, though it then says the photo is done", async () => {
    start.mockResolvedValue(job());
    const onTheWay = pending<GenerationJob>();
    status.mockReturnValueOnce(onTheWay.promise);
    const controller = new AbortController();
    const settled = outcome(
      makePhoto("x", "16:9", { signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);

    controller.abort();
    onTheWay.resolve(job({ done: true, photo }));
    await vi.advanceTimersByTimeAsync(10_000);
    // nothing more is asked, and the photo is not handed to a page that is gone
    expect(status).toHaveBeenCalledTimes(1);
    expect(await settled).toEqual({ error: controller.signal.reason });
  });

  it("stops when she leaves while the job is being started: it counts, and nothing is asked", async () => {
    const starting = pending<GenerationJob>();
    start.mockReturnValue(starting.promise);
    status.mockResolvedValue(job());
    const onStart = vi.fn();
    const controller = new AbortController();
    const settled = outcome(
      makePhoto("x", "16:9", { signal: controller.signal, onStart }),
    );
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    starting.resolve(job());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(status).not.toHaveBeenCalled();
    // the job is on its way all the same, and counts against the month
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(await settled).toEqual({ error: controller.signal.reason });
  });

  it("does not hand over a photo that comes back with the start, if she has left by then", async () => {
    const starting = pending<GenerationJob>();
    start.mockReturnValue(starting.promise);
    const controller = new AbortController();
    const settled = outcome(
      makePhoto("x", "16:9", { signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    // the service had the photo ready at once: there is no waiting for the loop to notice
    starting.resolve(job({ done: true, photo }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await settled).toEqual({ error: controller.signal.reason });
    expect(status).not.toHaveBeenCalled();
  });

  it("does not retry a failed status call once she has left", async () => {
    start.mockResolvedValue(job());
    status.mockRejectedValue(new ApiError(503, { detail: "busy" }));
    const controller = new AbortController();
    const settled = outcome(
      makePhoto("x", "16:9", { signal: controller.signal }),
    );
    // the first status call fails, and the retry waits 800 ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);

    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(status).toHaveBeenCalledTimes(1);
    expect(await settled).toEqual({ error: controller.signal.reason });
  });

  it("starts nothing for someone who has already gone", async () => {
    const controller = new AbortController();
    controller.abort();
    const settled = outcome(
      makePhoto("x", "16:9", { signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(start).not.toHaveBeenCalled();
    expect(await settled).toEqual({ error: controller.signal.reason });
  });

  it("gives up on a job that never finishes", async () => {
    start.mockResolvedValue(job());
    status.mockResolvedValue(job());
    const settled = makePhoto("x", "16:9").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    await expect(settled).resolves.toBeInstanceOf(Error);
    const asked = status.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(status).toHaveBeenCalledTimes(asked);
  });
});
