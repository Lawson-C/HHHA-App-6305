/** Normalized error for every failed data call (Sanity, Supabase, or a network failure). */
export class ApiError extends Error {
  status: number;
  name: string;
  details: unknown;

  constructor(status: number, name: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.name = name;
    this.details = details;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNetwork() {
    return this.status === 0;
  }
}
