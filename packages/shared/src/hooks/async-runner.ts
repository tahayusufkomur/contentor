// Pure core of useAsyncAction, kept React-free so it's unit-testable
// (repo convention: vitest covers pure logic only).

export interface AsyncRunnerCallbacks {
  setLoading: (v: boolean) => void;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

export function createAsyncRunner<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void> | void,
  cb: AsyncRunnerCallbacks,
): (...args: Args) => Promise<void> {
  let inFlight = false;
  return async (...args: Args) => {
    if (inFlight) return;
    inFlight = true;
    cb.setLoading(true);
    try {
      await fn(...args);
      cb.onSuccess?.();
    } catch (err) {
      cb.onError?.(err);
    } finally {
      inFlight = false;
      cb.setLoading(false);
    }
  };
}

export function errorMessage(
  err: unknown,
  fallback = "Something went wrong",
): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
