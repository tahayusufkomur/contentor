export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  /** Server's Retry-After hint in seconds (429s), when present. */
  retryAfter?: number;

  constructor(
    status: number,
    data: Record<string, unknown>,
    retryAfter?: number,
  ) {
    super((data.detail as string) || "API Error");
    this.status = status;
    this.data = data;
    this.retryAfter = retryAfter;
  }
}
