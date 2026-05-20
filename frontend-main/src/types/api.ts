export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super((data.detail as string) || "API Error");
    this.status = status;
    this.data = data;
  }
}
