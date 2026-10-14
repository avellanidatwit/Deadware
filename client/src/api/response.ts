export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
interface ErrorBody {
  error?: string;
  errors?: { line?: number; message: string }[];
}
/** Proxy errors are often HTML. Never show raw proxy bodies or JSON parser exceptions. */
export function decodeResponse<T>(text: string, status: number, ok: boolean): T {
  let data: unknown = {};
  try {
    data = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(
      ok
        ? 'The game server returned an invalid response. Try again shortly.'
        : 'The game server is unavailable. Try again shortly.',
      ok ? 502 : status,
    );
  }
  if (!ok) {
    const body = data && typeof data === 'object' ? (data as ErrorBody) : {};
    const error =
      typeof body.error === 'string'
        ? body.error
        : Array.isArray(body.errors)
          ? body.errors
              .filter((e) => e && typeof e.message === 'string')
              .map((e) => `${e.line ? `Line ${e.line}: ` : ''}${e.message}`)
              .join('\n')
          : '';
    throw new ApiError(error || 'Request failed.', status);
  }
  return data as T;
}
